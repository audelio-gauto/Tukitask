-- Migration 024: Multi-stop delivery support
-- Adds order_stops table for orders with multiple delivery destinations.
-- Single-stop orders continue to work exactly as before (is_multi_stop = false).

-- ─── Extend orders table ────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_multi_stop BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stop_count    INT     NOT NULL DEFAULT 1;

-- ─── order_stops ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_stops (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sequence         INT         NOT NULL,          -- 1-based: 1 = first delivery
  address          TEXT        NOT NULL,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  receiver_contact TEXT,
  receiver_phone   TEXT,
  description      TEXT,                          -- optional: "zapatos talle 40"
  status           TEXT        NOT NULL DEFAULT 'pending', -- pending | delivered | failed
  delivered_at     TIMESTAMPTZ,
  fail_reason      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_stops_order_id ON order_stops (order_id, sequence);

-- Row-level security: mirrors orders — driver of that order + the client can read/write
ALTER TABLE order_stops ENABLE ROW LEVEL SECURITY;

-- Using service_role (used by sbAdmin) bypasses RLS automatically.
-- These permissive policies cover authenticated users via client SDK if needed.
CREATE POLICY IF NOT EXISTS "order_stops_select"
  ON order_stops FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_stops.order_id
        AND (o.client_email = auth.jwt() ->> 'email'
          OR o.accepted_by  = auth.jwt() ->> 'email')
    )
  );

CREATE POLICY IF NOT EXISTS "order_stops_update"
  ON order_stops FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_stops.order_id
        AND o.accepted_by = auth.jwt() ->> 'email'
    )
  );

-- Enable realtime for live stop progress
ALTER PUBLICATION supabase_realtime ADD TABLE order_stops;
