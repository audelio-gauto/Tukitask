-- Migration 046: Driver/Tecnico feed tables for event-based matching

-- Feed tables (one row per driver/tecnico per order/job)
CREATE TABLE IF NOT EXISTS driver_feed (
  id          BIGSERIAL PRIMARY KEY,
  driver_email TEXT NOT NULL,
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  matched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  distance_km DOUBLE PRECISION,
  UNIQUE (driver_email, order_id)
);

CREATE TABLE IF NOT EXISTS tecnico_feed (
  id            BIGSERIAL PRIMARY KEY,
  tecnico_email TEXT NOT NULL,
  job_id        UUID NOT NULL REFERENCES tecnico_jobs(id) ON DELETE CASCADE,
  matched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  distance_km   DOUBLE PRECISION,
  UNIQUE (tecnico_email, job_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_feed_driver_email
  ON driver_feed(driver_email, matched_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_feed_order_id
  ON driver_feed(order_id);

CREATE INDEX IF NOT EXISTS idx_tecnico_feed_tecnico_email
  ON tecnico_feed(tecnico_email, matched_at DESC);

CREATE INDEX IF NOT EXISTS idx_tecnico_feed_job_id
  ON tecnico_feed(job_id);

-- RLS: allow users to read only their own feed rows
ALTER TABLE driver_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnico_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_feed_select_own ON driver_feed;
CREATE POLICY driver_feed_select_own
  ON driver_feed
  FOR SELECT
  USING (driver_email = auth.email());

DROP POLICY IF EXISTS tecnico_feed_select_own ON tecnico_feed;
CREATE POLICY tecnico_feed_select_own
  ON tecnico_feed
  FOR SELECT
  USING (tecnico_email = auth.email());

-- Haversine distance in KM (no PostGIS required)
CREATE OR REPLACE FUNCTION fn_haversine_km(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 2 * 6371 * ASIN(SQRT(
    POWER(SIN(RADIANS((lat2 - lat1) / 2)), 2) +
    COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
    POWER(SIN(RADIANS((lng2 - lng1) / 2)), 2)
  ));
$$;

-- Rebuild a single driver's feed (used on first load / refresh)
CREATE OR REPLACE FUNCTION refresh_driver_feed(p_driver_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_range DOUBLE PRECISION;
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
         fn_haversine_km(v_lat, v_lng, o.pickup_lat, o.pickup_lng)
  FROM orders o
  WHERE o.status IN ('pending', 'negotiating')
    AND o.pickup_lat IS NOT NULL AND o.pickup_lng IS NOT NULL
    AND fn_haversine_km(v_lat, v_lng, o.pickup_lat, o.pickup_lng) <= v_range
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

-- Rebuild a single tecnico's feed (used on first load / refresh)
CREATE OR REPLACE FUNCTION refresh_tecnico_feed(p_tecnico_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_range DOUBLE PRECISION;
  v_gender TEXT;
  v_services JSONB;
  v_verified BOOLEAN;
BEGIN
  SELECT dl.lat, dl.lng, COALESCE(ts.pickup_range, 20), ts.gender, ts.accepted_services, (ts.is_verified = true)
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
         fn_haversine_km(v_lat, v_lng, j.lat, j.lng)
  FROM tecnico_jobs j
  WHERE j.status = 'pending'
    AND j.lat IS NOT NULL AND j.lng IS NOT NULL
    AND fn_haversine_km(v_lat, v_lng, j.lat, j.lng) <= v_range
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

-- Match a new order to nearby drivers
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

  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF o.status NOT IN ('pending', 'negotiating') THEN
    RETURN;
  END IF;
  IF o.pickup_lat IS NULL OR o.pickup_lng IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO driver_feed (driver_email, order_id, distance_km)
  SELECT dl.driver_email, o.id,
         fn_haversine_km(dl.lat, dl.lng, o.pickup_lat, o.pickup_lng)
  FROM driver_locations dl
  LEFT JOIN driver_profiles dp ON dp.email = dl.driver_email
  WHERE dl.lat IS NOT NULL AND dl.lng IS NOT NULL
    AND dl.updated_at >= now() - interval '5 minutes'
    AND fn_haversine_km(dl.lat, dl.lng, o.pickup_lat, o.pickup_lng) <= COALESCE(dp.pickup_range, 10)
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

-- Match a new job to nearby tecnicos
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

  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF j.status <> 'pending' THEN
    RETURN;
  END IF;
  IF j.lat IS NULL OR j.lng IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO tecnico_feed (tecnico_email, job_id, distance_km)
  SELECT dl.driver_email, j.id,
         fn_haversine_km(dl.lat, dl.lng, j.lat, j.lng)
  FROM driver_locations dl
  LEFT JOIN tecnico_settings ts ON ts.email = dl.driver_email
  WHERE dl.lat IS NOT NULL AND dl.lng IS NOT NULL
    AND dl.updated_at >= now() - interval '5 minutes'
    AND fn_haversine_km(dl.lat, dl.lng, j.lat, j.lng) <= COALESCE(ts.pickup_range, 20)
    AND (
      ts.gender IS NULL OR ts.gender = '' OR
      j.service_gender IN (ts.gender, 'indiferente')
    )
    AND (
      ts.accepted_services IS NULL OR
      COALESCE((ts.accepted_services->>j.service_type)::BOOLEAN, true)
    )
    AND (
      j.require_verified_tecnico IS NOT TRUE OR ts.is_verified = true
    )
  ON CONFLICT DO NOTHING;
END;
$$;

-- Orders: populate / cleanup feed on insert/update/delete
CREATE OR REPLACE FUNCTION trg_orders_feed_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM fn_match_driver_feed(NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('pending', 'negotiating') AND OLD.status NOT IN ('pending', 'negotiating') THEN
      PERFORM fn_match_driver_feed(NEW.id);
    ELSIF NEW.status NOT IN ('pending', 'negotiating') AND OLD.status IN ('pending', 'negotiating') THEN
      DELETE FROM driver_feed WHERE order_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM driver_feed WHERE order_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_feed_ins ON orders;
CREATE TRIGGER trg_orders_feed_ins
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION trg_orders_feed_sync();

DROP TRIGGER IF EXISTS trg_orders_feed_upd ON orders;
CREATE TRIGGER trg_orders_feed_upd
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION trg_orders_feed_sync();

DROP TRIGGER IF EXISTS trg_orders_feed_del ON orders;
CREATE TRIGGER trg_orders_feed_del
  AFTER DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION trg_orders_feed_sync();

-- Tecnico jobs: populate / cleanup feed on insert/update/delete
CREATE OR REPLACE FUNCTION trg_tecnico_jobs_feed_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM fn_match_tecnico_feed(NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'pending' AND OLD.status <> 'pending' THEN
      PERFORM fn_match_tecnico_feed(NEW.id);
    ELSIF NEW.status <> 'pending' AND OLD.status = 'pending' THEN
      DELETE FROM tecnico_feed WHERE job_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM tecnico_feed WHERE job_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tecnico_jobs_feed_ins ON tecnico_jobs;
CREATE TRIGGER trg_tecnico_jobs_feed_ins
  AFTER INSERT ON tecnico_jobs
  FOR EACH ROW EXECUTE FUNCTION trg_tecnico_jobs_feed_sync();

DROP TRIGGER IF EXISTS trg_tecnico_jobs_feed_upd ON tecnico_jobs;
CREATE TRIGGER trg_tecnico_jobs_feed_upd
  AFTER UPDATE OF status ON tecnico_jobs
  FOR EACH ROW EXECUTE FUNCTION trg_tecnico_jobs_feed_sync();

DROP TRIGGER IF EXISTS trg_tecnico_jobs_feed_del ON tecnico_jobs;
CREATE TRIGGER trg_tecnico_jobs_feed_del
  AFTER DELETE ON tecnico_jobs
  FOR EACH ROW EXECUTE FUNCTION trg_tecnico_jobs_feed_sync();
