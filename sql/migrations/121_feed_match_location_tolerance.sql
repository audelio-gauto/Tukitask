-- 121: fn_match_driver_feed tolera ubicaciones de hasta 30 min (antes 5 min).
-- Un driver quieto o con la app en segundo plano no actualiza driver_locations
-- seguido y quedaba fuera del feed al crearse el pedido (sobre todo fleteros).
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
    AND dl.updated_at >= now() - interval '30 minutes'
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
