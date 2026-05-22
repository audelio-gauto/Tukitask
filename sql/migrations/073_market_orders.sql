-- Market orders: vendor → client marketplace transactions
-- These are purchases from vendor stores (not deliveries/tecnico jobs)

CREATE TABLE IF NOT EXISTS market_orders (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT        NOT NULL DEFAULT 'pending',
  vendor_email  TEXT        NOT NULL,
  client_email  TEXT        NOT NULL,
  client_name   TEXT,
  items         JSONB       NOT NULL DEFAULT '[]',
  total         NUMERIC     NOT NULL DEFAULT 0,
  final_price   NUMERIC,
  address       TEXT,
  driver_email  TEXT,
  accepted_at   TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  negotiated    BOOLEAN     NOT NULL DEFAULT false,
  notes         TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_market_orders_status      ON market_orders (status);
CREATE INDEX IF NOT EXISTS idx_market_orders_created_at  ON market_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_orders_vendor      ON market_orders (vendor_email);
CREATE INDEX IF NOT EXISTS idx_market_orders_client      ON market_orders (client_email);
CREATE INDEX IF NOT EXISTS idx_market_orders_driver      ON market_orders (driver_email);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_market_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_market_orders_updated_at ON market_orders;
CREATE TRIGGER trg_market_orders_updated_at
  BEFORE UPDATE ON market_orders
  FOR EACH ROW EXECUTE FUNCTION update_market_orders_updated_at();

-- RLS
ALTER TABLE market_orders ENABLE ROW LEVEL SECURITY;

-- Service-role (sbAdmin) bypasses RLS — these policies cover client-side SDK calls
DROP POLICY IF EXISTS "market_orders vendor select" ON market_orders;
CREATE POLICY "market_orders vendor select"
  ON market_orders FOR SELECT TO authenticated
  USING (vendor_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "market_orders client select" ON market_orders;
CREATE POLICY "market_orders client select"
  ON market_orders FOR SELECT TO authenticated
  USING (client_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

COMMENT ON TABLE market_orders IS 'Vendor-to-client marketplace purchase orders';
