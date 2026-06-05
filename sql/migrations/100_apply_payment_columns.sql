-- ============================================================
-- 100: Aplica columnas faltantes en payment_methods_config
--      y crea vendor_bank_data si no existe.
--
--   EJECUTAR EN SUPABASE SQL EDITOR (seguro con IF NOT EXISTS)
-- ============================================================

-- ── 1. Columna vendor_allowed ────────────────────────────────
ALTER TABLE payment_methods_config
  ADD COLUMN IF NOT EXISTS vendor_allowed BOOLEAN NOT NULL DEFAULT true;

UPDATE payment_methods_config
   SET vendor_allowed = true
 WHERE id IN ('transfer', 'cash_on_delivery');

-- ── 2. Columna bank_data ─────────────────────────────────────
ALTER TABLE payment_methods_config
  ADD COLUMN IF NOT EXISTS bank_data JSONB DEFAULT NULL;

-- ── 3. Tabla vendor_bank_data ────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_bank_data (
  vendor_email  TEXT        PRIMARY KEY,
  banco         TEXT,
  cuenta        TEXT,
  alias         TEXT,
  titular       TEXT,
  tipo_cuenta   TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE vendor_bank_data ENABLE ROW LEVEL SECURITY;

-- Políticas (DROP IF EXISTS + CREATE para evitar duplicados)
DROP POLICY IF EXISTS "vbd_service_role"  ON vendor_bank_data;
DROP POLICY IF EXISTS "vbd_owner_select"  ON vendor_bank_data;
DROP POLICY IF EXISTS "vbd_owner_upsert"  ON vendor_bank_data;
DROP POLICY IF EXISTS "vbd_owner_update"  ON vendor_bank_data;
DROP POLICY IF EXISTS "vbd_admin_select"  ON vendor_bank_data;

CREATE POLICY "vbd_service_role"
  ON vendor_bank_data FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "vbd_owner_select"
  ON vendor_bank_data FOR SELECT
  USING (vendor_email = auth.jwt() ->> 'email');

CREATE POLICY "vbd_owner_upsert"
  ON vendor_bank_data FOR INSERT
  WITH CHECK (vendor_email = auth.jwt() ->> 'email');

CREATE POLICY "vbd_owner_update"
  ON vendor_bank_data FOR UPDATE
  USING (vendor_email = auth.jwt() ->> 'email');

CREATE POLICY "vbd_admin_select"
  ON vendor_bank_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

GRANT SELECT, INSERT, UPDATE ON vendor_bank_data TO authenticated, service_role;
