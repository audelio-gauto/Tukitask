-- Migration 068: admin_force_status RPC
-- Allows admin to forcefully change the status of an order or tecnico_job,
-- bypassing triggers (e.g. driver_feed sync) that may raise exceptions.
-- This is service-role only — never exposed to regular users.

CREATE OR REPLACE FUNCTION admin_force_set_order_status(
  p_id        UUID,
  p_status    TEXT,
  p_cancelled_at TIMESTAMPTZ DEFAULT NULL,
  p_completed_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Disable per-session triggers so driver_feed sync doesn't block the update
  SET LOCAL session_replication_role = 'replica';

  UPDATE orders
  SET
    status       = p_status,
    cancelled_at = COALESCE(p_cancelled_at, cancelled_at),
    completed_at = COALESCE(p_completed_at, completed_at)
  WHERE id = p_id;

  -- Restore triggers
  SET LOCAL session_replication_role = 'origin';
END;
$$;

CREATE OR REPLACE FUNCTION admin_force_set_tecnico_status(
  p_id        UUID,
  p_status    TEXT,
  p_completed_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL session_replication_role = 'replica';

  UPDATE tecnico_jobs
  SET
    status       = p_status,
    completed_at = COALESCE(p_completed_at, completed_at)
  WHERE id = p_id;

  SET LOCAL session_replication_role = 'origin';
END;
$$;

-- Only service_role can call these functions
REVOKE ALL ON FUNCTION admin_force_set_order_status(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_force_set_tecnico_status(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_force_set_order_status(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION admin_force_set_tecnico_status(UUID, TEXT, TIMESTAMPTZ) TO service_role;
