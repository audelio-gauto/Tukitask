-- ============================================================
-- 098: Datos bancarios para transferencias
--   - payment_methods_config.bank_data: datos bancarios globales del marketplace
--   - vendor_bank_data: datos bancarios por vendedor
-- Lógica de checkout:
--   Si transfer global is_active=true  → mostrar datos globales del marketplace
--   Si transfer global is_active=false → mostrar datos propios del vendedor
-- ============================================================

-- ── 1. Columna bank_data en payment_methods_config ──────────
ALTER TABLE payment_methods_config
  ADD COLUMN IF NOT EXISTS bank_data JSONB DEFAULT NULL;

-- Ejemplo de bank_data esperado:
-- { "banco": "Banco Itaú", "cuenta": "123456789", "alias": "tukimarket.py",
--   "titular": "TukiMarket S.A.", "tipo_cuenta": "Cuenta corriente" }

-- ── 2. Tabla datos bancarios por vendedor ───────────────────
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

-- Service role: acceso total
CREATE POLICY "vbd_service_role"
  ON vendor_bank_data FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Vendedor: sólo puede leer/escribir sus propios datos
CREATE POLICY "vbd_owner_select"
  ON vendor_bank_data FOR SELECT
  USING (vendor_email = auth.jwt() ->> 'email');

CREATE POLICY "vbd_owner_upsert"
  ON vendor_bank_data FOR INSERT
  WITH CHECK (vendor_email = auth.jwt() ->> 'email');

CREATE POLICY "vbd_owner_update"
  ON vendor_bank_data FOR UPDATE
  USING (vendor_email = auth.jwt() ->> 'email');

-- Admin puede leer todos los datos bancarios
CREATE POLICY "vbd_admin_select"
  ON vendor_bank_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

-- ── 3. Grants ────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON vendor_bank_data TO authenticated, service_role;
