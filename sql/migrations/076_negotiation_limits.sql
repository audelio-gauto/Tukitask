-- Migration 076: Tabla de límites de negociación (TukiBot)
CREATE TABLE IF NOT EXISTS negotiation_limits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  value NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  min NUMERIC NOT NULL DEFAULT 0,
  max NUMERIC NOT NULL DEFAULT 100,
  step NUMERIC NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE negotiation_limits ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden modificar; todos los autenticados pueden leer
CREATE POLICY "admin_write_negotiation_limits" ON negotiation_limits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

CREATE POLICY "authenticated_read_negotiation_limits" ON negotiation_limits
  FOR SELECT USING (auth.role() = 'authenticated');

-- Seed inicial con valores por defecto
INSERT INTO negotiation_limits (id, name, key, description, value, unit, min, max, step, is_active)
VALUES
  ('max_discount_pct',       'Descuento maximo',                 'max_discount_pct',       'Porcentaje maximo que un vendedor puede ofrecer de descuento en una negociacion.', 30,   '%',           1,      90,     1,   true),
  ('max_offers_per_day',     'Ofertas maximas por dia',          'max_offers_per_day',     'Cantidad maxima de ofertas que un vendedor puede enviar por dia.',                 10,   'ofertas/dia', 1,      100,    1,   true),
  ('min_offer_time_minutes', 'Tiempo minimo entre ofertas',      'min_offer_time_minutes', 'Minutos minimos que deben pasar entre dos ofertas del mismo vendedor al mismo cliente.', 5, 'minutos', 1, 60,   1,   true),
  ('min_price_gs',           'Precio minimo de venta',           'min_price_gs',           'Precio minimo en guaranies que puede tener un producto publicado.',              1000,  'Gs',          100,    100000, 100, true),
  ('max_negotiation_rounds', 'Rondas maximas de negociacion',    'max_negotiation_rounds', 'Numero maximo de contra-ofertas permitidas en una misma negociacion.',            5,    'rondas',      1,      20,     1,   true),
  ('offer_expiry_hours',     'Expiracion de oferta',             'offer_expiry_hours',     'Horas que tiene validez una oferta antes de expirar automaticamente.',            24,   'horas',       1,      72,     1,   true)
ON CONFLICT (id) DO NOTHING;
