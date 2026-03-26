-- ============================================================
-- 017: Sistema de Billetera Tukitask
--   - driver_wallets: saldo actual por driver/técnico
--   - wallet_transactions: historial de recargas y comisiones
--   - RLS policies
--   - deduct_commission(): descuento atómico al completar orden
--   - deduct_commission_job(): descuento atómico al completar trabajo técnico
-- ============================================================

-- ── 1. Saldo actual por trabajador ───────────────────────────
CREATE TABLE IF NOT EXISTS driver_wallets (
  driver_email TEXT        PRIMARY KEY,
  balance      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE driver_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_service_role" ON driver_wallets;
CREATE POLICY "wallet_service_role"
  ON driver_wallets FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Driver ve solo su propio saldo
DROP POLICY IF EXISTS "wallet_owner_select" ON driver_wallets;
CREATE POLICY "wallet_owner_select"
  ON driver_wallets FOR SELECT
  USING (driver_email = auth.jwt() ->> 'email');

-- ── 2. Historial de transacciones ────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_email TEXT          NOT NULL,
  type         TEXT          NOT NULL CHECK (type IN ('recharge','commission','adjustment')),
  amount       NUMERIC(10,2) NOT NULL,   -- positivo = recarga, negativo = comisión
  order_id     UUID,                      -- NULL para recargas manuales
  job_id       UUID,                      -- para trabajos de técnico
  note         TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_driver  ON wallet_transactions(driver_email);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_order   ON wallet_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_job     ON wallet_transactions(job_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON wallet_transactions(created_at DESC);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_tx_service_role" ON wallet_transactions;
CREATE POLICY "wallet_tx_service_role"
  ON wallet_transactions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "wallet_tx_owner_select" ON wallet_transactions;
CREATE POLICY "wallet_tx_owner_select"
  ON wallet_transactions FOR SELECT
  USING (driver_email = auth.jwt() ->> 'email');

-- ── 3. Solicitudes de recarga (tickets) ──────────────────────
CREATE TABLE IF NOT EXISTS recharge_requests (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_email   TEXT          NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  receipt_url    TEXT,          -- foto del comprobante en Supabase Storage
  status         TEXT          NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected')),
  reviewed_by    TEXT,          -- admin email
  reviewed_at    TIMESTAMPTZ,
  rejection_note TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recharge_driver ON recharge_requests(driver_email);
CREATE INDEX IF NOT EXISTS idx_recharge_status ON recharge_requests(status, created_at DESC);

ALTER TABLE recharge_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recharge_service_role" ON recharge_requests;
CREATE POLICY "recharge_service_role"
  ON recharge_requests FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Driver puede ver y crear sus propias solicitudes
DROP POLICY IF EXISTS "recharge_owner_select" ON recharge_requests;
CREATE POLICY "recharge_owner_select"
  ON recharge_requests FOR SELECT
  USING (driver_email = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS "recharge_owner_insert" ON recharge_requests;
CREATE POLICY "recharge_owner_insert"
  ON recharge_requests FOR INSERT
  WITH CHECK (driver_email = auth.jwt() ->> 'email');

-- ── 4. commission_pct en vehicle_pricing y tecnico_settings ──
ALTER TABLE vehicle_pricing   ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) NOT NULL DEFAULT 10.00;
ALTER TABLE tecnico_settings  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) NOT NULL DEFAULT 12.00;

-- ── 5. RPC: descuento atómico al completar envío (orders) ────
CREATE OR REPLACE FUNCTION deduct_commission(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order       RECORD;
  v_pct         NUMERIC;
  v_commission  NUMERIC;
BEGIN
  -- Bloquear la fila para evitar doble cobro
  SELECT id, status, accepted_by, offer, vehicle_type
    INTO v_order
    FROM orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order.status = 'commission_charged' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_charged');
  END IF;

  -- Obtener % de comisión según tipo de vehículo
  SELECT COALESCE(commission_pct, 10.00) INTO v_pct
    FROM vehicle_pricing
   WHERE vehicle_type = v_order.vehicle_type
   LIMIT 1;

  v_commission := ROUND((COALESCE(v_order.offer, 0) * COALESCE(v_pct, 10.00) / 100), 2);

  -- Upsert wallet (crear si no existe)
  INSERT INTO driver_wallets (driver_email, balance)
    VALUES (v_order.accepted_by, 0.00)
    ON CONFLICT (driver_email) DO NOTHING;

  -- Descontar del saldo
  UPDATE driver_wallets
     SET balance = balance - v_commission,
         updated_at = now()
   WHERE driver_email = v_order.accepted_by;

  -- Registrar transacción
  INSERT INTO wallet_transactions (driver_email, type, amount, order_id, note)
    VALUES (v_order.accepted_by, 'commission', -v_commission, p_order_id,
            'Comisión ' || COALESCE(v_pct,10)::TEXT || '% sobre Gs ' || COALESCE(v_order.offer,0)::TEXT);

  -- Marcar orden como comisión cobrada
  UPDATE orders
     SET status = 'commission_charged'
   WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'commission', v_commission,
    'pct',        v_pct,
    'driver',     v_order.accepted_by
  );
END;
$$;

-- ── 6. RPC: descuento atómico al completar trabajo técnico ───
CREATE OR REPLACE FUNCTION deduct_commission_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job        RECORD;
  v_pct        NUMERIC;
  v_commission NUMERIC;
BEGIN
  SELECT id, status, tecnico_email, agreed_price, service_type
    INTO v_job
    FROM tecnico_jobs
   WHERE id = p_job_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_found');
  END IF;

  IF v_job.status = 'commission_charged' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_charged');
  END IF;

  -- Obtener % de comisión del técnico (global de tecnico_settings o default 12%)
  SELECT COALESCE(commission_pct, 12.00) INTO v_pct
    FROM tecnico_settings
   WHERE email = v_job.tecnico_email
   LIMIT 1;

  v_commission := ROUND((COALESCE(v_job.agreed_price, 0) * COALESCE(v_pct, 12.00) / 100), 2);

  INSERT INTO driver_wallets (driver_email, balance)
    VALUES (v_job.tecnico_email, 0.00)
    ON CONFLICT (driver_email) DO NOTHING;

  UPDATE driver_wallets
     SET balance = balance - v_commission,
         updated_at = now()
   WHERE driver_email = v_job.tecnico_email;

  INSERT INTO wallet_transactions (driver_email, type, amount, job_id, note)
    VALUES (v_job.tecnico_email, 'commission', -v_commission, p_job_id,
            'Comisión ' || COALESCE(v_pct,12)::TEXT || '% sobre Gs ' || COALESCE(v_job.agreed_price,0)::TEXT);

  UPDATE tecnico_jobs
     SET status = 'commission_charged'
   WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'commission', v_commission,
    'pct',        v_pct,
    'tecnico',    v_job.tecnico_email
  );
END;
$$;

-- ── 7. RPC: aprobar recarga (solo llamada desde API con service_role) ──
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

  -- Acreditar saldo
  INSERT INTO driver_wallets (driver_email, balance)
    VALUES (v_req.driver_email, v_req.amount)
    ON CONFLICT (driver_email) DO UPDATE
      SET balance = driver_wallets.balance + EXCLUDED.balance,
          updated_at = now();

  -- Registrar transacción
  INSERT INTO wallet_transactions (driver_email, type, amount, note)
    VALUES (v_req.driver_email, 'recharge', v_req.amount,
            'Recarga aprobada por ' || p_admin_email);

  -- Marcar solicitud aprobada
  UPDATE recharge_requests
     SET status = 'approved', reviewed_by = p_admin_email, reviewed_at = now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'amount', v_req.amount, 'driver', v_req.driver_email);
END;
$$;

-- ── 8. RPC: rechazar recarga ──────────────────────────────────
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
