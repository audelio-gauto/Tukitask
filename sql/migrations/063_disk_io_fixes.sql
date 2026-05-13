-- Migration 063: Disk IO reduction (May 2026)
--
-- Addresses "Disk IO Budget" alert from Supabase.
-- Root causes identified:
--   1. fn_cleanup_stale_data() runs only once/day (Vercel cron 03:00).
--      During the day driver_feed / tecnico_feed / notifications / driver_offers
--      accumulate and every query must scan more rows → high IO.
--   2. driver_offers (accepted/rejected) never pruned → grows indefinitely.
--   3. No updated_at index on driver_locations for the active-driver filter.
--
-- Changes:
--   A. Extend fn_cleanup_stale_data() to also prune old driver_offers.
--   B. Add index on driver_locations(updated_at) for active-driver filter.
--   C. Tune autovacuum on the three highest-write tables.
-- ============================================================================

-- ── A. Extend cleanup function ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_cleanup_stale_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_feed_deleted    INTEGER := 0;
  v_tecnico_feed_deleted   INTEGER := 0;
  v_notifications_deleted  INTEGER := 0;
  v_offers_deleted         INTEGER := 0;
  v_driver_offers_deleted  INTEGER := 0;
BEGIN
  -- 1. driver_feed: eliminar rows cuya orden ya no está en pending/negotiating
  DELETE FROM driver_feed df
  USING orders o
  WHERE o.id = df.order_id
    AND o.status NOT IN ('pending', 'negotiating');
  GET DIAGNOSTICS v_driver_feed_deleted = ROW_COUNT;

  -- 2. driver_feed: eliminar rows de órdenes huérfanas
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

  -- 4. tecnico_feed: eliminar rows de jobs huérfanos
  DELETE FROM tecnico_feed
  WHERE job_id NOT IN (
    SELECT id FROM tecnico_jobs WHERE status = 'pending'
  );

  -- 5. notifications: eliminar leídas de más de 30 días
  DELETE FROM notifications
  WHERE read_at IS NOT NULL
    AND created_at < now() - INTERVAL '30 days';

  -- 6. notifications: eliminar no leídas de más de 60 días
  DELETE FROM notifications
  WHERE created_at < now() - INTERVAL '60 days';
  GET DIAGNOSTICS v_notifications_deleted = ROW_COUNT;

  -- 7. tecnico_job_offers: eliminar ofertas de jobs cancelados/completados > 7 días
  DELETE FROM tecnico_job_offers o
  USING tecnico_jobs j
  WHERE j.id = o.job_id
    AND j.status IN ('cancelled', 'completado', 'incidente')
    AND o.created_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_offers_deleted = ROW_COUNT;

  -- 8. NEW: driver_offers: eliminar ofertas aceptadas/rechazadas/canceladas > 3 días
  --    Estas rows se acumulan sin límite porque el cleanup anterior no las tocaba.
  DELETE FROM driver_offers
  WHERE status IN ('accepted', 'rejected', 'cancelled', 'expired')
    AND created_at < now() - INTERVAL '3 days';
  GET DIAGNOSTICS v_driver_offers_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'driver_feed_deleted',   v_driver_feed_deleted,
    'tecnico_feed_deleted',  v_tecnico_feed_deleted,
    'notifications_deleted', v_notifications_deleted,
    'offers_deleted',        v_offers_deleted,
    'driver_offers_deleted', v_driver_offers_deleted,
    'executed_at',           now()
  );
END;
$$;

-- ── B. Index on driver_locations.updated_at ───────────────────────────────────
-- Matching algorithm filters: WHERE updated_at > now() - interval '5 minutes'
-- Without this index it does a full table scan on every match request.
CREATE INDEX IF NOT EXISTS idx_driver_locations_updated_at
  ON public.driver_locations (updated_at DESC);

-- ── C. Autovacuum tuning for high-write tables ─────────────────────────────────
-- Default autovacuum triggers at 20% dead tuples. For tables with heavy
-- insert/delete churn (feed tables, notifications), lower the threshold
-- so VACUUM runs more frequently and reclaims bloat faster.

ALTER TABLE public.driver_feed
  SET (autovacuum_vacuum_scale_factor = 0.05,
       autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE public.tecnico_feed
  SET (autovacuum_vacuum_scale_factor = 0.05,
       autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE public.notifications
  SET (autovacuum_vacuum_scale_factor = 0.05,
       autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE public.driver_offers
  SET (autovacuum_vacuum_scale_factor = 0.05,
       autovacuum_analyze_scale_factor = 0.05);
