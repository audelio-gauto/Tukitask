-- ============================================================
-- 019: Alias de banco + fix orden parámetros approve/reject_recharge
-- ============================================================

-- ── 1. Tabla alias de banco (editable por admin) ─────────────
CREATE TABLE IF NOT EXISTS bank_alias (
  id         SERIAL       PRIMARY KEY,
  bank_name  TEXT         NOT NULL,
  alias      TEXT         NOT NULL,        -- nombre/número de cuenta
  extra_info TEXT,                         -- ej: "Banco BNF - Cuenta Ahorro"
  is_active  BOOLEAN      NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE bank_alias ENABLE ROW LEVEL SECURITY;

-- Todos pueden leer (para mostrar al recargar)
DROP POLICY IF EXISTS "bank_alias_public_read" ON bank_alias;
CREATE POLICY "bank_alias_public_read"
  ON bank_alias FOR SELECT USING (true);

-- Solo service_role escribe
DROP POLICY IF EXISTS "bank_alias_service_role" ON bank_alias;
CREATE POLICY "bank_alias_service_role"
  ON bank_alias FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ── 2. DROP + RECREAR approve_recharge con orden correcto ────
-- Supabase cachea el orden de parámetros de la firma original;
-- la firma correcta es: (p_request_id UUID, p_admin_email TEXT)
DROP FUNCTION IF EXISTS approve_recharge(UUID, TEXT);
DROP FUNCTION IF EXISTS approve_recharge(TEXT, UUID);

CREATE OR REPLACE FUNCTION approve_recharge(p_request_id UUID, p_admin_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req RECORD;
BEGIN
  SELECT * INTO v_req FROM recharge_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_reviewed');
  END IF;

  INSERT INTO driver_wallets (driver_email, balance)
    VALUES (v_req.driver_email, v_req.amount)
    ON CONFLICT (driver_email) DO UPDATE
      SET balance = driver_wallets.balance + EXCLUDED.balance,
          updated_at = now();

  INSERT INTO wallet_transactions (driver_email, type, amount, note)
    VALUES (v_req.driver_email, 'recharge', v_req.amount,
            'Recarga aprobada por ' || p_admin_email);

  UPDATE recharge_requests
     SET status = 'approved', reviewed_by = p_admin_email, reviewed_at = now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'amount', v_req.amount, 'driver', v_req.driver_email);
END;
$$;

-- ── 3. DROP + RECREAR reject_recharge ────────────────────────
DROP FUNCTION IF EXISTS reject_recharge(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS reject_recharge(TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION reject_recharge(p_request_id UUID, p_admin_email TEXT, p_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE recharge_requests
     SET status = 'rejected',
         reviewed_by = p_admin_email,
         reviewed_at = now(),
         rejection_note = p_note
   WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_already_reviewed');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
