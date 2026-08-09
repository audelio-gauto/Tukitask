-- 106_product_warranty_days.sql
-- Agrega campo warranty_days a la tabla products (días de garantía ofrecida por el vendedor)

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS warranty_days integer DEFAULT 0 CHECK (warranty_days >= 0);

COMMENT ON COLUMN products.warranty_days IS 'Días de garantía ofrecida por el vendedor. 0 = sin garantía especificada.';
