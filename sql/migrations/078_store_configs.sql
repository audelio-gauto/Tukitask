-- Migration 078: Store template configs saved by vendors
-- Allows visitors to load a vendor's custom store branding by vendor UUID

CREATE TABLE IF NOT EXISTS store_configs (
  vendor_id  UUID PRIMARY KEY,
  config     JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE store_configs ENABLE ROW LEVEL SECURITY;

-- Vendor can manage their own config
DROP POLICY IF EXISTS "vendor_manage_own_config" ON store_configs;
CREATE POLICY "vendor_manage_own_config" ON store_configs
  FOR ALL USING (vendor_id = auth.uid());

-- Anyone can read any store config (needed for marketplace visitors)
DROP POLICY IF EXISTS "public_read_store_config" ON store_configs;
CREATE POLICY "public_read_store_config" ON store_configs
  FOR SELECT USING (true);

COMMENT ON TABLE store_configs IS 'Vendor store template configurations saved from /vendedor/plantillas. Allows visitors to see correct branding on /tienda/{vendor_uuid}.';
