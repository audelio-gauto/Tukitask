-- Migration 077: Tabla de productos de vendedores con flujo de aprobación
-- Flujo: vendor crea (pending_review/draft) → admin aprueba (published) → aparece en marketplace/tienda

CREATE TABLE IF NOT EXISTS products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        UUID NOT NULL,
  vendor_email     TEXT NOT NULL,
  name             TEXT NOT NULL,
  sku              TEXT,
  category         TEXT NOT NULL DEFAULT 'otros',
  type             TEXT NOT NULL DEFAULT 'physical' CHECK (type IN ('physical', 'digital', 'service')),
  description      TEXT,
  price            NUMERIC NOT NULL DEFAULT 0,
  floor_price      NUMERIC NOT NULL DEFAULT 0,
  stock            INTEGER NOT NULL DEFAULT 0,
  image            TEXT,
  gallery          JSONB NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'pending_review' CHECK (
    status IN ('draft', 'pending_review', 'published', 'rejected', 'paused', 'out_of_stock')
  ),
  negotiable       BOOLEAN NOT NULL DEFAULT true,
  pricing_tiers    JSONB NOT NULL DEFAULT '[]',
  rejection_reason TEXT,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  views            INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_vendor_id  ON products (vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_status     ON products (status);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category   ON products (category);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_products_updated_at();

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Admins: full access
DROP POLICY IF EXISTS "admin_all_products" ON products;
CREATE POLICY "admin_all_products" ON products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Vendors: full access to their own products
DROP POLICY IF EXISTS "vendor_own_products" ON products;
CREATE POLICY "vendor_own_products" ON products
  FOR ALL USING (vendor_id = auth.uid());

-- Public (authenticated or anon): only see published products
DROP POLICY IF EXISTS "public_published_products" ON products;
CREATE POLICY "public_published_products" ON products
  FOR SELECT USING (status = 'published');

COMMENT ON TABLE products IS 'Vendor product catalog with admin approval flow';
COMMENT ON COLUMN products.status IS 'draft: not submitted | pending_review: waiting admin | published: live | rejected: denied | paused: vendor-paused | out_of_stock: auto';
