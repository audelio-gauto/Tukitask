-- Migration 105: product_reviews for TukiMarket
-- Stores buyer reviews (rating + comment) per product.
-- One review per buyer per product (UNIQUE constraint).

CREATE TABLE IF NOT EXISTS product_reviews (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  vendor_id    UUID        NOT NULL,
  buyer_email  TEXT        NOT NULL,
  rating       SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT        CHECK (char_length(comment) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, buyer_email)
);

CREATE INDEX IF NOT EXISTS product_reviews_product_id_idx ON product_reviews (product_id);
CREATE INDEX IF NOT EXISTS product_reviews_vendor_id_idx  ON product_reviews (vendor_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "public read product_reviews"
  ON product_reviews FOR SELECT USING (true);

-- Authenticated buyers can insert their own review
CREATE POLICY "buyer insert product_reviews"
  ON product_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.email() = buyer_email);

-- Authenticated buyers can update their own review
CREATE POLICY "buyer update product_reviews"
  ON product_reviews FOR UPDATE TO authenticated
  USING  (auth.email() = buyer_email)
  WITH CHECK (auth.email() = buyer_email);

-- ── Updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_product_reviews_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_reviews_updated_at
  BEFORE UPDATE ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION update_product_reviews_updated_at();
