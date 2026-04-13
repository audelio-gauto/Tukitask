-- ─────────────────────────────────────────────────────────────────────────────
-- 024 · Tips, scheduled orders, favourite drivers, promo codes
-- Run with: supabase db push  (or execute in Supabase SQL editor)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tips ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_tips (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_email  TEXT        NOT NULL,
  driver_email  TEXT        NOT NULL,
  amount        INTEGER     NOT NULL CHECK (amount > 0),    -- Guaraníes
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_tips_order_id_uq ON order_tips (order_id);

-- Track on orders so we can display tip badge without joining
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount INTEGER DEFAULT 0;

-- RLS
ALTER TABLE order_tips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_insert_own_tip"  ON order_tips;
DROP POLICY IF EXISTS "tip_select_participants" ON order_tips;
CREATE POLICY "client_insert_own_tip"  ON order_tips FOR INSERT
  TO authenticated WITH CHECK (client_email = auth.jwt() ->> 'email');
CREATE POLICY "tip_select_participants" ON order_tips FOR SELECT
  TO authenticated USING (
    client_email = auth.jwt() ->> 'email' OR
    driver_email = auth.jwt() ->> 'email'
  );


-- ── 2. Scheduled orders ───────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS date_scheduled TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS orders_date_scheduled_idx ON orders (date_scheduled)
  WHERE date_scheduled IS NOT NULL;


-- ── 3. Favourite drivers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_favorites (
  client_email  TEXT        NOT NULL,
  driver_email  TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_email, driver_email)
);

ALTER TABLE driver_favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_manage_own_favs" ON driver_favorites;
DROP POLICY IF EXISTS "driver_see_favs"         ON driver_favorites;
CREATE POLICY "client_manage_own_favs" ON driver_favorites
  TO authenticated USING   (client_email = auth.jwt() ->> 'email')
                  WITH CHECK (client_email = auth.jwt() ->> 'email');
CREATE POLICY "driver_see_favs" ON driver_favorites FOR SELECT
  TO authenticated USING (driver_email = auth.jwt() ->> 'email');


-- ── 4. Promo codes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT        NOT NULL UNIQUE,
  description    TEXT,
  discount_pct   INTEGER     DEFAULT 0 CHECK (discount_pct  >= 0 AND discount_pct  <= 100),
  discount_fixed INTEGER     DEFAULT 0 CHECK (discount_fixed >= 0),
  min_order_gs   INTEGER     DEFAULT 0,          -- minimum order value to apply
  max_uses       INTEGER     DEFAULT NULL,        -- NULL = unlimited
  used_count     INTEGER     NOT NULL DEFAULT 0,
  applicable_to  TEXT        NOT NULL DEFAULT 'all' CHECK (applicable_to IN ('all','envio','tecnico')),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at     TIMESTAMPTZ DEFAULT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Track code usage per user (prevents double-use)
CREATE TABLE IF NOT EXISTS promo_code_uses (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id     UUID  NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_email  TEXT  NOT NULL,
  order_id    UUID  REFERENCES orders(id) ON DELETE SET NULL,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code_id, user_email)
);

ALTER TABLE promo_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_uses   ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active codes (needed to validate in client)
-- The validate API uses service role, so no policy issue there
DROP POLICY IF EXISTS "read_active_promos" ON promo_codes;
CREATE POLICY "read_active_promos" ON promo_codes FOR SELECT
  TO authenticated USING (is_active = TRUE);

DROP POLICY IF EXISTS "user_see_own_uses" ON promo_code_uses;
CREATE POLICY "user_see_own_uses" ON promo_code_uses FOR SELECT
  TO authenticated USING (user_email = auth.jwt() ->> 'email');

-- Admin helpers: store promo_code applied to each order
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code       TEXT    DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_discount   INTEGER DEFAULT 0;
