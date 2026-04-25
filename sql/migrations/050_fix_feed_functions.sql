-- Migration 050: Fix feed functions
-- Fixes two bugs introduced in migration 046:
-- 1. tecnico_settings has column 'verified', NOT 'is_verified'
-- 2. pickup_lat/pickup_lng / tecnico_jobs.lat/lng may be NUMERIC in production;
--    add explicit ::DOUBLE PRECISION casts so fn_haversine_km always resolves.

-- Re-create refresh_tecnico_feed with correct column name and explicit casts
CREATE OR REPLACE FUNCTION refresh_tecnico_feed(p_tecnico_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_lat      DOUBLE PRECISION;
  v_lng      DOUBLE PRECISION;
  v_range    DOUBLE PRECISION;
  v_gender   TEXT;
  v_services JSONB;
  v_verified BOOLEAN;
BEGIN
  SELECT dl.lat, dl.lng,
         COALESCE(ts.pickup_range, 20),
         ts.gender,
         ts.accepted_services,
         (ts.verified = true)
    INTO v_lat, v_lng, v_range, v_gender, v_services, v_verified
  FROM driver_locations dl
  LEFT JOIN tecnico_settings ts ON ts.email = dl.driver_email
  WHERE dl.driver_email = p_tecnico_email;

  DELETE FROM tecnico_feed WHERE tecnico_email = p_tecnico_email;

  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO tecnico_feed (tecnico_email, job_id, distance_km)
  SELECT p_tecnico_email, j.id,
         fn_haversine_km(v_lat, v_lng, j.lat::DOUBLE PRECISION, j.lng::DOUBLE PRECISION)
  FROM tecnico_jobs j
  WHERE j.status = 'pending'
    AND j.lat IS NOT NULL AND j.lng IS NOT NULL
    AND fn_haversine_km(v_lat, v_lng, j.lat::DOUBLE PRECISION, j.lng::DOUBLE PRECISION) <= v_range
    AND (
      v_gender IS NULL OR v_gender = '' OR
      j.service_gender IN (v_gender, 'indiferente')
    )
    AND (
      v_services IS NULL OR
      COALESCE((v_services->>j.service_type)::BOOLEAN, true)
    )
    AND (
      j.require_verified_tecnico IS NOT TRUE OR v_verified = true
    );
END;
$$;

-- Re-create fn_match_tecnico_feed with correct column and casts
CREATE OR REPLACE FUNCTION fn_match_tecnico_feed(p_job_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  j RECORD;
BEGIN
  SELECT id, status, lat, lng, service_type, service_gender, require_verified_tecnico
    INTO j
  FROM tecnico_jobs
  WHERE id = p_job_id;

  IF NOT FOUND THEN RETURN; END IF;
  IF j.status <> 'pending' THEN RETURN; END IF;
  IF j.lat IS NULL OR j.lng IS NULL THEN RETURN; END IF;

  INSERT INTO tecnico_feed (tecnico_email, job_id, distance_km)
  SELECT dl.driver_email, j.id,
         fn_haversine_km(dl.lat, dl.lng, j.lat::DOUBLE PRECISION, j.lng::DOUBLE PRECISION)
  FROM driver_locations dl
  LEFT JOIN tecnico_settings ts ON ts.email = dl.driver_email
  WHERE dl.lat IS NOT NULL AND dl.lng IS NOT NULL
    AND dl.updated_at >= now() - interval '5 minutes'
    AND fn_haversine_km(dl.lat, dl.lng, j.lat::DOUBLE PRECISION, j.lng::DOUBLE PRECISION) <= COALESCE(ts.pickup_range, 20)
    AND (
      ts.gender IS NULL OR ts.gender = '' OR
      j.service_gender IN (ts.gender, 'indiferente')
    )
    AND (
      ts.accepted_services IS NULL OR
      COALESCE((ts.accepted_services->>j.service_type)::BOOLEAN, true)
    )
    AND (
      j.require_verified_tecnico IS NOT TRUE OR ts.verified = true
    )
  ON CONFLICT DO NOTHING;
END;
$$;

-- Re-create refresh_driver_feed with explicit casts for pickup_lat/pickup_lng
CREATE OR REPLACE FUNCTION refresh_driver_feed(p_driver_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_lat     DOUBLE PRECISION;
  v_lng     DOUBLE PRECISION;
  v_range   DOUBLE PRECISION;
  v_filters JSONB;
BEGIN
  SELECT dl.lat, dl.lng, COALESCE(dp.pickup_range, 10), dp.service_filters
    INTO v_lat, v_lng, v_range, v_filters
  FROM driver_locations dl
  LEFT JOIN driver_profiles dp ON dp.email = dl.driver_email
  WHERE dl.driver_email = p_driver_email;

  DELETE FROM driver_feed WHERE driver_email = p_driver_email;

  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO driver_feed (driver_email, order_id, distance_km)
  SELECT p_driver_email, o.id,
         fn_haversine_km(v_lat, v_lng, o.pickup_lat::DOUBLE PRECISION, o.pickup_lng::DOUBLE PRECISION)
  FROM orders o
  WHERE o.status IN ('pending', 'negotiating')
    AND o.pickup_lat IS NOT NULL AND o.pickup_lng IS NOT NULL
    AND fn_haversine_km(v_lat, v_lng, o.pickup_lat::DOUBLE PRECISION, o.pickup_lng::DOUBLE PRECISION) <= v_range
    AND (
      o.vehicle_type IS NULL OR
      CASE o.vehicle_type
        WHEN 'moto'      THEN COALESCE((v_filters->>'moto_envios')::BOOLEAN, true)
        WHEN 'auto'      THEN COALESCE((v_filters->>'auto_envios')::BOOLEAN, true)
        WHEN 'motocarro' THEN COALESCE((v_filters->>'moto_carro_fletes')::BOOLEAN, true)
        WHEN 'camion2t'  THEN COALESCE((v_filters->>'camion_fletes')::BOOLEAN, true)
        ELSE true
      END
    );
END;
$$;

-- Re-create fn_match_driver_feed with explicit casts
CREATE OR REPLACE FUNCTION fn_match_driver_feed(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  o RECORD;
BEGIN
  SELECT id, status, pickup_lat, pickup_lng, vehicle_type
    INTO o
  FROM orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN RETURN; END IF;
  IF o.status NOT IN ('pending', 'negotiating') THEN RETURN; END IF;
  IF o.pickup_lat IS NULL OR o.pickup_lng IS NULL THEN RETURN; END IF;

  INSERT INTO driver_feed (driver_email, order_id, distance_km)
  SELECT dl.driver_email, o.id,
         fn_haversine_km(dl.lat, dl.lng, o.pickup_lat::DOUBLE PRECISION, o.pickup_lng::DOUBLE PRECISION)
  FROM driver_locations dl
  LEFT JOIN driver_profiles dp ON dp.email = dl.driver_email
  WHERE dl.lat IS NOT NULL AND dl.lng IS NOT NULL
    AND dl.updated_at >= now() - interval '5 minutes'
    AND fn_haversine_km(dl.lat, dl.lng, o.pickup_lat::DOUBLE PRECISION, o.pickup_lng::DOUBLE PRECISION) <= COALESCE(dp.pickup_range, 10)
    AND (
      o.vehicle_type IS NULL OR
      CASE o.vehicle_type
        WHEN 'moto'      THEN COALESCE((dp.service_filters->>'moto_envios')::BOOLEAN, true)
        WHEN 'auto'      THEN COALESCE((dp.service_filters->>'auto_envios')::BOOLEAN, true)
        WHEN 'motocarro' THEN COALESCE((dp.service_filters->>'moto_carro_fletes')::BOOLEAN, true)
        WHEN 'camion2t'  THEN COALESCE((dp.service_filters->>'camion_fletes')::BOOLEAN, true)
        ELSE true
      END
    )
  ON CONFLICT DO NOTHING;
END;
$$;
