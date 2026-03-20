-- =============================================
-- Pricing Configuration Tables
-- Package multipliers & vehicle-specific pricing
-- =============================================

-- Package type multipliers
CREATE TABLE IF NOT EXISTS package_multipliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_type TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vehicle-specific pricing overrides
CREATE TABLE IF NOT EXISTS vehicle_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  base_price NUMERIC(10,2),       -- NULL = usa global
  price_per_km NUMERIC(10,2),     -- NULL = usa global
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Global pricing settings (min price, global base, global per km)
CREATE TABLE IF NOT EXISTS pricing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value NUMERIC(10,2) NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default package multipliers
INSERT INTO package_multipliers (package_type, label, emoji, multiplier, description, sort_order) VALUES
  ('documento',  'Documento',          '📄', 1.0, 'Multiplicador de precio (por defecto: 1). Ej: 1.5 = +50%',   1),
  ('pequeno',    'Pequeño (hasta 5 kg)', '📦', 1.0, 'Multiplicador de precio (por defecto: 1). Ej: 1.5 = +50%',   2),
  ('mediano',    'Mediano (5-15 kg)',   '📦', 1.2, 'Multiplicador de precio (por defecto: 1.2). Ej: 1.5 = +50%', 3),
  ('grande',     'Grande (15-30 kg)',   '📦', 1.5, 'Multiplicador de precio (por defecto: 1.5). Ej: 1.5 = +50%', 4),
  ('fragil',     'Frágil',             '⚠️', 1.3, 'Multiplicador de precio (por defecto: 1.3). Ej: 1.5 = +50%', 5),
  ('flete',      'Flete',              '🏗️', 2.0, 'Multiplicador de precio (por defecto: 2). Ej: 1.5 = +50%',   6),
  ('mudanza',    'Mudanza',            '🏠', 2.5, 'Multiplicador de precio (por defecto: 2.5). Ej: 1.5 = +50%', 7)
ON CONFLICT (package_type) DO NOTHING;

-- Seed default vehicle pricing
INSERT INTO vehicle_pricing (vehicle_type, label, emoji, base_price, price_per_km, sort_order) VALUES
  ('moto',          'Moto',             '🏍️', NULL, NULL, 1),
  ('auto',          'Auto',             '🚗', NULL, NULL, 2),
  ('moto_carro',    'Moto carro',       '🛺', NULL, NULL, 3),
  ('camion_3000',   'Camión 3000 kg',   '🚛', NULL, NULL, 4),
  ('camion_5000',   'Camión 5000 kg',   '🚛', NULL, NULL, 5)
ON CONFLICT (vehicle_type) DO NOTHING;

-- Seed default pricing settings
INSERT INTO pricing_settings (key, value, label, description) VALUES
  ('min_shipping_price', 5.00, 'Precio Mínimo de Envío', 'El envío nunca costará menos de este monto.')
ON CONFLICT (key) DO NOTHING;

-- Map provider and API keys (empty by default)
INSERT INTO pricing_settings (key, value, label, description) VALUES
  ('map_provider', 0, 'Proveedor de Mapas', '0=osm, 1=mapbox, 2=google (valor usado por la UI)'),
  ('mapbox_api_key', 0, 'Mapbox API Key', 'Clave pública de Mapbox para geocoding y routing'),
  ('google_maps_api_key', 0, 'Google Maps API Key', 'Clave de Google Maps para Places/Directions')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE package_multipliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_settings ENABLE ROW LEVEL SECURITY;

-- App-level string settings (for API keys and similar)
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  label TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value, label, description) VALUES
  ('mapbox_api_key', '', 'Mapbox API Key', 'Clave pública de Mapbox para geocoding y routing'),
  ('google_maps_api_key', '', 'Google Maps API Key', 'Clave de Google Maps para Places/Directions')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Policies: read for authenticated, write for admins only
CREATE POLICY "Allow read for authenticated" ON package_multipliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON vehicle_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON pricing_settings FOR SELECT TO authenticated USING (true);

-- For updates, rely on service_role key via API (not anon)
