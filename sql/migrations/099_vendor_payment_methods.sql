-- ============================================================
-- 099: Campo vendor_allowed en payment_methods_config
--   Controla si los vendedores pueden usar cada método de pago
--   en su tienda (independiente del toggle global del marketplace).
-- ============================================================

ALTER TABLE payment_methods_config
  ADD COLUMN IF NOT EXISTS vendor_allowed BOOLEAN NOT NULL DEFAULT true;

-- Seed: ambos métodos habilitados para vendedores por defecto
UPDATE payment_methods_config
   SET vendor_allowed = true
 WHERE id IN ('transfer', 'cash_on_delivery');
