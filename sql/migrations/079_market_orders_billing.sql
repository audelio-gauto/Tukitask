-- Migration 079: Add structured billing + delivery columns to market_orders
-- Needed for the tienda checkout flow

ALTER TABLE market_orders
  ADD COLUMN IF NOT EXISTS billing  JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delivery JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vendor_id UUID;

-- Allow authenticated clients to insert their own orders
DROP POLICY IF EXISTS "market_orders client insert" ON market_orders;
CREATE POLICY "market_orders client insert"
  ON market_orders FOR INSERT TO authenticated
  WITH CHECK (client_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

COMMENT ON COLUMN market_orders.billing  IS 'JSON: { name, email, phone, cedula, wants_invoice }';
COMMENT ON COLUMN market_orders.delivery IS 'JSON: { ciudad, barrio, referencia, nombre, lat, lng }';
