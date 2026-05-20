-- Migration 070: Cola de timeouts para negociaciones de TukiBot
-- Fase 4: procesar automáticamente negociaciones vencidas por cron.

CREATE TABLE IF NOT EXISTS tukibot_negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT,
  listed_price NUMERIC NOT NULL,
  floor_price NUMERIC NOT NULL,
  buyer_offer NUMERIC NOT NULL,
  counter_amount NUMERIC,
  final_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'countered' CHECK (
    status IN ('accepted', 'countered', 'timeout_auto_counter', 'timeout_auto_accept', 'timeout_pressure')
  ),
  timeout_action TEXT NOT NULL DEFAULT 'auto_counter' CHECK (
    timeout_action IN ('auto_counter', 'auto_accept', 'pressure_client')
  ),
  timeout_at TIMESTAMPTZ,
  timed_out_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tukibot_negotiations_vendor_id
  ON tukibot_negotiations (vendor_id);

CREATE INDEX IF NOT EXISTS idx_tukibot_negotiations_timeout_pending
  ON tukibot_negotiations (timeout_at)
  WHERE status = 'countered' AND timed_out_at IS NULL;

CREATE OR REPLACE FUNCTION fn_tukibot_process_timeouts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auto_counter INTEGER := 0;
  v_auto_accept  INTEGER := 0;
  v_pressure     INTEGER := 0;
BEGIN
  UPDATE tukibot_negotiations
  SET
    status = 'timeout_auto_counter',
    final_amount = counter_amount,
    timed_out_at = now(),
    updated_at = now()
  WHERE status = 'countered'
    AND timed_out_at IS NULL
    AND timeout_at IS NOT NULL
    AND timeout_action = 'auto_counter'
    AND timeout_at <= now();
  GET DIAGNOSTICS v_auto_counter = ROW_COUNT;

  UPDATE tukibot_negotiations
  SET
    status = 'timeout_auto_accept',
    final_amount = buyer_offer,
    timed_out_at = now(),
    updated_at = now()
  WHERE status = 'countered'
    AND timed_out_at IS NULL
    AND timeout_at IS NOT NULL
    AND timeout_action = 'auto_accept'
    AND timeout_at <= now();
  GET DIAGNOSTICS v_auto_accept = ROW_COUNT;

  UPDATE tukibot_negotiations
  SET
    status = 'timeout_pressure',
    final_amount = counter_amount,
    timed_out_at = now(),
    updated_at = now()
  WHERE status = 'countered'
    AND timed_out_at IS NULL
    AND timeout_at IS NOT NULL
    AND timeout_action = 'pressure_client'
    AND timeout_at <= now();
  GET DIAGNOSTICS v_pressure = ROW_COUNT;

  RETURN jsonb_build_object(
    'auto_counter_processed', v_auto_counter,
    'auto_accept_processed',  v_auto_accept,
    'pressure_processed',     v_pressure,
    'total_processed',        (v_auto_counter + v_auto_accept + v_pressure),
    'executed_at',            now()
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_tukibot_process_timeouts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_tukibot_process_timeouts() TO service_role;
