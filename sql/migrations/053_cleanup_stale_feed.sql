-- Migration 053: Función de limpieza de datos huérfanos / stale
-- Elimina rows acumuladas en driver_feed, tecnico_feed, notificaciones antiguas
-- y ofertas de jobs ya no disponibles.
-- Se llama desde /api/cron/cleanup (Vercel Cron) o manualmente.

CREATE OR REPLACE FUNCTION fn_cleanup_stale_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_driver_feed_deleted   INTEGER := 0;
  v_tecnico_feed_deleted  INTEGER := 0;
  v_notifications_deleted INTEGER := 0;
  v_offers_deleted        INTEGER := 0;
BEGIN
  -- 1. driver_feed: eliminar rows cuya orden ya no está en pending/negotiating
  DELETE FROM driver_feed df
  USING orders o
  WHERE o.id = df.order_id
    AND o.status NOT IN ('pending', 'negotiating');
  GET DIAGNOSTICS v_driver_feed_deleted = ROW_COUNT;

  -- 2. driver_feed: eliminar rows de órdenes que ya no existen (huérfanas)
  DELETE FROM driver_feed
  WHERE order_id NOT IN (
    SELECT id FROM orders WHERE status IN ('pending', 'negotiating')
  );

  -- 3. tecnico_feed: eliminar rows cuyo job ya no está en pending
  DELETE FROM tecnico_feed tf
  USING tecnico_jobs j
  WHERE j.id = tf.job_id
    AND j.status <> 'pending';
  GET DIAGNOSTICS v_tecnico_feed_deleted = ROW_COUNT;

  -- 4. tecnico_feed: eliminar rows de jobs que ya no existen (huérfanas)
  DELETE FROM tecnico_feed
  WHERE job_id NOT IN (
    SELECT id FROM tecnico_jobs WHERE status = 'pending'
  );

  -- 5. notifications: eliminar notificaciones leídas de más de 30 días
  DELETE FROM notifications
  WHERE read_at IS NOT NULL
    AND created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_notifications_deleted = ROW_COUNT;

  -- 6. notifications: eliminar notificaciones no leídas de más de 60 días
  DELETE FROM notifications
  WHERE created_at < now() - INTERVAL '60 days';

  -- 7. tecnico_job_offers: eliminar ofertas de jobs ya cancelados/completados
  DELETE FROM tecnico_job_offers o
  USING tecnico_jobs j
  WHERE j.id = o.job_id
    AND j.status IN ('cancelled', 'completado', 'incidente')
    AND o.created_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_offers_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'driver_feed_deleted',   v_driver_feed_deleted,
    'tecnico_feed_deleted',  v_tecnico_feed_deleted,
    'notifications_deleted', v_notifications_deleted,
    'offers_deleted',        v_offers_deleted,
    'executed_at',           now()
  );
END;
$$;

-- Permisos: solo service_role puede ejecutar esta función
REVOKE ALL ON FUNCTION fn_cleanup_stale_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cleanup_stale_data() TO service_role;