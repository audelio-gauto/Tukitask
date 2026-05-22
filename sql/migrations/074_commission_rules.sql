-- Migration 074: Tabla de reglas de comisión para configuración admin
CREATE TABLE IF NOT EXISTS commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'percentage' CHECK (type IN ('fixed', 'percentage')),
  value NUMERIC NOT NULL DEFAULT 0,
  applies_to TEXT NOT NULL DEFAULT 'vendor' CHECK (applies_to IN ('vendor', 'driver', 'service', 'all')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden ver y modificar reglas de comisión
CREATE POLICY "admin_all_commission_rules" ON commission_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

-- Seed inicial
INSERT INTO commission_rules (name, type, value, applies_to, is_active)
VALUES
  ('Comision fija por venta', 'fixed', 5000, 'vendor', true),
  ('Comision porcentual vendedor', 'percentage', 10, 'vendor', true)
ON CONFLICT DO NOTHING;
