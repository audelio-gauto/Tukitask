-- Keep existing drivers compatible until their app synchronizes its local state.
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS accepting_orders BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.refresh_driver_feed(p_driver_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_range DOUBLE PRECISION;
  v_filters JSONB;
  v_available BOOLEAN;
BEGIN
  SELECT dl.lat, dl.lng, COALESCE(dp.pickup_range, 50), dp.service_filters,
         COALESCE(dp.accepting_orders, true)
    INTO v_lat, v_lng, v_range, v_filters, v_available
  FROM driver_locations dl
  LEFT JOIN driver_profiles dp ON dp.email = dl.driver_email
  WHERE dl.driver_email = p_driver_email;

  DELETE FROM driver_feed WHERE driver_email = p_driver_email;
  IF v_lat IS NULL OR v_lng IS NULL OR NOT v_available THEN RETURN; END IF;

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

CREATE OR REPLACE FUNCTION public.fn_match_driver_feed(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  o RECORD;
BEGIN
  SELECT id, status, pickup_lat, pickup_lng, vehicle_type INTO o
  FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF o.status NOT IN ('pending', 'negotiating') THEN RETURN; END IF;
  IF o.pickup_lat IS NULL OR o.pickup_lng IS NULL THEN RETURN; END IF;

  INSERT INTO driver_feed (driver_email, order_id, distance_km)
  SELECT dl.driver_email, o.id,
         fn_haversine_km(dl.lat, dl.lng, o.pickup_lat::DOUBLE PRECISION, o.pickup_lng::DOUBLE PRECISION)
  FROM driver_locations dl
  LEFT JOIN driver_profiles dp ON dp.email = dl.driver_email
  WHERE dl.lat IS NOT NULL AND dl.lng IS NOT NULL
    AND dl.updated_at >= now() - interval '30 minutes'
    AND COALESCE(dp.accepting_orders, true)
    AND fn_haversine_km(dl.lat, dl.lng, o.pickup_lat::DOUBLE PRECISION, o.pickup_lng::DOUBLE PRECISION) <= COALESCE(dp.pickup_range, 50)
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
