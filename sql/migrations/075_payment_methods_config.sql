-- Migration 075: Tabla de configuración de métodos de pago
CREATE TABLE IF NOT EXISTS payment_methods_config (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  fee_fixed NUMERIC NOT NULL DEFAULT 0,
  fee_percentage NUMERIC NOT NULL DEFAULT 0,
  icon TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payment_methods_config ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden modificar; todos los autenticados pueden leer
CREATE POLICY "admin_write_payment_methods" ON payment_methods_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

CREATE POLICY "authenticated_read_payment_methods" ON payment_methods_config
  FOR SELECT USING (auth.role() = 'authenticated');

-- Seed inicial
INSERT INTO payment_methods_config (id, name, key, description, is_active, fee_fixed, fee_percentage, icon)
VALUES
  ('transfer',          'Transferencia Bancaria',  'transfer',          'Pago mediante transferencia bancaria o billetera digital (Tigo Money, Personal Pay, etc.)', true,  0, 0, 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z'),
  ('cash_on_delivery',  'Contra Entrega',           'cash_on_delivery',  'El cliente paga en efectivo al recibir el producto o servicio.',                            true,  0, 0, 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z')
ON CONFLICT (id) DO NOTHING;
