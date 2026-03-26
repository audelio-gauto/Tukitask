-- =============================================
-- Migration 007: Schema hardening for production scale
--
-- Fixes:
--  1. accepted_by UUID → TEXT (stores driver email, matches app code)
--  2. Missing runtime columns referenced in code (fail_reason, return_*, etc.)
--  3. Composite index for the most frequent query (status + created_at)
--  4. PostGIS extension + geographic column + GIST index for driver matching
--  5. driver_offers table (create if not exists from earlier migration)
--  6. RLS on orders + driver_offers
--  7. accept_offer() RPC — atomic, race-condition-free offer acceptance
--  8. Realtime publication for live updates (Supabase Realtime)
-- =============================================

-- ---------------------------------------------------------------------------
-- 1. Fix accepted_by: UUID → TEXT  (stores driver email in all app code)
-- ---------------------------------------------------------------------------
ALTER TABLE orders ALTER COLUMN accepted_by TYPE TEXT USING accepted_by::TEXT;

-- ---------------------------------------------------------------------------
-- 2. Add missing runtime columns (referenced in PATCH handler)
-- ---------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fail_reason           TEXT,
  ADD COLUMN IF NOT EXISTS return_reason         TEXT,
  ADD COLUMN IF NOT EXISTS return_rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS returning_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS incident_closed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_attempts       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pickup_lat            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pickup_lng            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_lat          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_lng          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS package_type          TEXT,
  ADD COLUMN IF NOT EXISTS rate_score            INT,
  ADD COLUMN IF NOT EXISTS rate_note             TEXT,
  ADD COLUMN IF NOT EXISTS rated_at              TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 3. Indexes: most frequent query patterns
-- ---------------------------------------------------------------------------
-- Composite for status list + recency (the main driver feed query)
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders (status, created_at DESC);

-- For client's "my orders" view
CREATE INDEX IF NOT EXISTS idx_orders_client_email
  ON orders (client_email);

-- For driver's active/history view
CREATE INDEX IF NOT EXISTS idx_orders_accepted_by
  ON orders (accepted_by);

-- ---------------------------------------------------------------------------
-- 4. PostGIS — geographic matching for driver/tecnico proximity
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_point  GEOGRAPHY(POINT, 4326),
  ADD COLUMN IF NOT EXISTS delivery_point GEOGRAPHY(POINT, 4326);

-- GIST index for ST_DWithin queries (driver matching within radius)
CREATE INDEX IF NOT EXISTS idx_orders_pickup_geo
  ON orders USING GIST (pickup_point);

-- After inserting or updating lat/lng, populate the geography column:
-- UPDATE orders SET pickup_point = ST_MakePoint(pickup_lng, pickup_lat)::geography
-- WHERE pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. driver_offers table (authoritative definition)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_offers (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  order_id     UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_email TEXT         NOT NULL,
  driver_name  TEXT,
  driver_photo TEXT,
  amount       NUMERIC(10,2) NOT NULL,
  status       TEXT         NOT NULL DEFAULT 'pending' -- pending | accepted | rejected
);

CREATE INDEX IF NOT EXISTS idx_driver_offers_order_id     ON driver_offers (order_id);
CREATE INDEX IF NOT EXISTS idx_driver_offers_driver_email ON driver_offers (driver_email);
CREATE INDEX IF NOT EXISTS idx_driver_offers_status       ON driver_offers (status);

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_offers ENABLE ROW LEVEL SECURITY;

-- Drivers see all available orders in the marketplace feed
DROP POLICY IF EXISTS "drivers_see_available_orders" ON orders;
CREATE POLICY "drivers_see_available_orders" ON orders
  FOR SELECT TO authenticated
  USING (status IN ('pending', 'negotiating'));

-- Each client sees only their own orders
DROP POLICY IF EXISTS "client_sees_own_orders" ON orders;
CREATE POLICY "client_sees_own_orders" ON orders
  FOR SELECT TO authenticated
  USING (client_email = auth.jwt() ->> 'email');

-- Each driver sees their own assigned orders
DROP POLICY IF EXISTS "driver_sees_assigned_orders" ON orders;
CREATE POLICY "driver_sees_assigned_orders" ON orders
  FOR SELECT TO authenticated
  USING (accepted_by = auth.jwt() ->> 'email');

-- Offer visibility: driver sees own offers; client sees offers on their orders
DROP POLICY IF EXISTS "offer_visibility" ON driver_offers;
CREATE POLICY "offer_visibility" ON driver_offers
  FOR SELECT TO authenticated
  USING (
    driver_email = auth.jwt() ->> 'email'
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = driver_offers.order_id
        AND orders.client_email = auth.jwt() ->> 'email'
    )
  );

-- NOTE: All INSERT/UPDATE/DELETE on these tables goes through service_role
-- (our API routes use sbAdmin which bypasses RLS — no INSERT policies needed).

-- ---------------------------------------------------------------------------
-- 7. Atomic accept_offer() RPC — prevents double-acceptance race conditions
--    Called as: supabaseServer.rpc('accept_offer', { p_offer_id, p_client_email })
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_offer(
  p_offer_id     UUID,
  p_client_email TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- runs with owner (postgres) privs, bypasses RLS
AS $$
DECLARE
  v_offer  driver_offers%ROWTYPE;
  v_order  orders%ROWTYPE;
BEGIN
  -- Lock the offer row — prevents concurrent accepts on the same offer
  SELECT * INTO v_offer
  FROM driver_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer not found', 'status', 404);
  END IF;

  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer is no longer pending', 'status', 409);
  END IF;

  -- Lock + verify the order ownership
  SELECT * INTO v_order
  FROM orders
  WHERE id = v_offer.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found', 'status', 404);
  END IF;

  IF v_order.client_email != p_client_email THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your order', 'status', 403);
  END IF;

  IF v_order.status NOT IN ('pending', 'negotiating') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order already assigned', 'status', 409);
  END IF;

  -- Accept this offer
  UPDATE driver_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  -- Reject all other pending offers for this order atomically
  UPDATE driver_offers
  SET status = 'rejected', updated_at = now()
  WHERE order_id = v_offer.order_id
    AND id != p_offer_id
    AND status = 'pending';

  -- Assign the order to the driver
  UPDATE orders
  SET
    status      = 'accepted',
    accepted_by = v_offer.driver_email,
    accepted_at = now(),
    offer       = v_offer.amount
  WHERE id = v_offer.order_id;

  RETURN jsonb_build_object(
    'success',      true,
    'driver_email', v_offer.driver_email,
    'amount',       v_offer.amount,
    'offer',        row_to_json(v_offer)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Supabase Realtime publication
--    Tables must be added to the realtime publication for postgres_changes
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Add orders if not already in the publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;

  -- Add driver_offers
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'driver_offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE driver_offers;
  END IF;
END $$;
