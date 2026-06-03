-- ============================================================
-- 097: Billetera Vendedor
--   - vendor_wallets: saldo por vendedor
--   - vendor_wallet_transactions: historial (comisiones, recargas, ajustes)
--   - vendor_recharge_requests: solicitudes de recarga con comprobante
--   - deduct_vendor_commission(): descuento atómico al marcar pedido entregado
--   - approve_vendor_recharge(): aprobar recarga y acreditar saldo
--   - reject_vendor_recharge(): rechazar recarga
--   - app_config: vendor_credit_limit (límite negativo configurable)
-- ============================================================

-- ── 1. Saldo actual por vendedor ─────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_wallets (
  vendor_email TEXT          PRIMARY KEY,
  balance      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE vendor_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_wallets_service_role"
  ON vendor_wallets FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "vendor_wallets_owner_select"
  ON vendor_wallets FOR SELECT
  USING (vendor_email = auth.jwt() ->> 'email');

-- ── 2. Historial de transacciones ────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_wallet_transactions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_email    TEXT          NOT NULL,
  type            TEXT          NOT NULL CHECK (type IN (
                    'sale_commission','recharge','adjustment',
                    'admin_credit','admin_debit','refund','bonus')),
  amount          NUMERIC(12,2) NOT NULL,   -- positivo = ingreso, negativo = comisión
  market_order_id UUID,
  note            TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vwt_email   ON vendor_wallet_transactions(vendor_email);
CREATE INDEX IF NOT EXISTS idx_vwt_order   ON vendor_wallet_transactions(market_order_id);
CREATE INDEX IF NOT EXISTS idx_vwt_created ON vendor_wallet_transactions(created_at DESC);

ALTER TABLE vendor_wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vwt_service_role"
  ON vendor_wallet_transactions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "vwt_owner_select"
  ON vendor_wallet_transactions FOR SELECT
  USING (vendor_email = auth.jwt() ->> 'email');

-- ── 3. Solicitudes de recarga ─────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_recharge_requests (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_email   TEXT          NOT NULL,
  amount         NUMERIC(12,2) NOT NULL,
  receipt_url    TEXT,
  status         TEXT          NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected')),
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ,
  rejection_note TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vrr_email  ON vendor_recharge_requests(vendor_email);
CREATE INDEX IF NOT EXISTS idx_vrr_status ON vendor_recharge_requests(status, created_at DESC);

ALTER TABLE vendor_recharge_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vrr_service_role"
  ON vendor_recharge_requests FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "vrr_owner_select"
  ON vendor_recharge_requests FOR SELECT
  USING (vendor_email = auth.jwt() ->> 'email');

CREATE POLICY "vrr_owner_insert"
  ON vendor_recharge_requests FOR INSERT
  WITH CHECK (vendor_email = auth.jwt() ->> 'email');

-- ── 4. app_config: límite negativo configurable ──────────────
INSERT INTO public.app_config (key, value)
VALUES ('vendor_credit_limit', '-500000')
ON CONFLICT (key) DO NOTHING;

-- ── 5. RPC: deduct_vendor_commission ─────────────────────────
-- Descuenta comisión al vendedor cuando el pedido se marca como entregado.
-- Lee commission_rules (applies_to='vendor', is_active=true) y aplica:
--   porcentual: total * pct / 100
--   fija: monto fijo
-- La comisión total = suma de todas las reglas activas.
CREATE OR REPLACE FUNCTION deduct_vendor_commission(p_market_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order        RECORD;
  v_rules        RECORD;
  v_commission   NUMERIC := 0;
  v_rule_pct     NUMERIC := 0;
  v_rule_fixed   NUMERIC := 0;
  v_new_balance  NUMERIC;
  v_credit_limit NUMERIC;
BEGIN
  -- Bloquear fila para evitar doble cobro
  SELECT id, status, vendor_email, total
    INTO v_order
    FROM market_orders
   WHERE id = p_market_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order.status = 'commission_charged' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_charged');
  END IF;

  -- Calcular comisión sumando todas las reglas activas para vendor
  FOR v_rules IN
    SELECT type, value FROM commission_rules
     WHERE applies_to IN ('vendor','all') AND is_active = true
  LOOP
    IF v_rules.type = 'percentage' THEN
      v_rule_pct := v_rule_pct + v_rules.value;
    ELSIF v_rules.type = 'fixed' THEN
      v_rule_fixed := v_rule_fixed + v_rules.value;
    END IF;
  END LOOP;

  v_commission := ROUND((v_order.total * v_rule_pct / 100.0) + v_rule_fixed, 2);

  IF v_commission <= 0 THEN
    -- No hay comisión configurada, sólo marcar el pedido
    UPDATE market_orders SET status = 'commission_charged' WHERE id = p_market_order_id;
    RETURN jsonb_build_object('ok', true, 'commission', 0, 'balance', null);
  END IF;

  -- Leer límite negativo configurado en app_config
  SELECT COALESCE(value::NUMERIC, -500000)
    INTO v_credit_limit
    FROM public.app_config
   WHERE key = 'vendor_credit_limit';

  -- Upsert wallet y descontar
  INSERT INTO vendor_wallets (vendor_email, balance, updated_at)
  VALUES (v_order.vendor_email, -v_commission, now())
  ON CONFLICT (vendor_email) DO UPDATE
    SET balance    = vendor_wallets.balance - v_commission,
        updated_at = now()
  RETURNING balance INTO v_new_balance;

  -- Registrar transacción
  INSERT INTO vendor_wallet_transactions
    (vendor_email, type, amount, market_order_id, note)
  VALUES
    (v_order.vendor_email, 'sale_commission', -v_commission,
     p_market_order_id,
     'Comisión pedido #' || LEFT(p_market_order_id::TEXT, 8));

  -- Marcar pedido como comisión cobrada
  UPDATE market_orders SET status = 'commission_charged' WHERE id = p_market_order_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'commission', v_commission,
    'balance',    v_new_balance
  );
END;
$$;

-- ── 6. RPC: approve_vendor_recharge ──────────────────────────
CREATE OR REPLACE FUNCTION approve_vendor_recharge(
  p_request_id  UUID,
  p_admin_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req         RECORD;
  v_new_balance NUMERIC;
BEGIN
  SELECT id, vendor_email, amount, status
    INTO v_req
    FROM vendor_recharge_requests
   WHERE id = p_request_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END IF;

  -- Acreditar saldo
  INSERT INTO vendor_wallets (vendor_email, balance, updated_at)
  VALUES (v_req.vendor_email, v_req.amount, now())
  ON CONFLICT (vendor_email) DO UPDATE
    SET balance    = vendor_wallets.balance + v_req.amount,
        updated_at = now()
  RETURNING balance INTO v_new_balance;

  -- Registrar transacción
  INSERT INTO vendor_wallet_transactions
    (vendor_email, type, amount, note)
  VALUES
    (v_req.vendor_email, 'recharge', v_req.amount, 'Recarga aprobada por admin');

  -- Aprobar solicitud
  UPDATE vendor_recharge_requests
     SET status      = 'approved',
         reviewed_by = p_admin_email,
         reviewed_at = now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'ok',      true,
    'vendor',  v_req.vendor_email,
    'amount',  v_req.amount,
    'balance', v_new_balance
  );
END;
$$;

-- ── 7. RPC: reject_vendor_recharge ───────────────────────────
CREATE OR REPLACE FUNCTION reject_vendor_recharge(
  p_request_id  UUID,
  p_admin_email TEXT,
  p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req RECORD;
BEGIN
  SELECT id, vendor_email, status
    INTO v_req
    FROM vendor_recharge_requests
   WHERE id = p_request_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END IF;

  UPDATE vendor_recharge_requests
     SET status         = 'rejected',
         reviewed_by    = p_admin_email,
         reviewed_at    = now(),
         rejection_note = p_note
   WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'vendor', v_req.vendor_email);
END;
$$;

-- ── 8. Realtime para saldo en tiempo real ────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE vendor_wallets;

-- ── 9. Grants ────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON vendor_wallets             TO authenticated, service_role;
GRANT SELECT, INSERT         ON vendor_wallet_transactions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON vendor_recharge_requests   TO authenticated, service_role;
