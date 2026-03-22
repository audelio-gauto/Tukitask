-- inDrive-style driver offers / negotiation
CREATE TABLE IF NOT EXISTS driver_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_email TEXT NOT NULL,
  driver_name TEXT,
  driver_photo TEXT,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, rejected, expired
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_driver_offers_order ON driver_offers(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_offers_driver ON driver_offers(driver_email);
CREATE INDEX IF NOT EXISTS idx_driver_offers_status ON driver_offers(status);

-- Add new statuses to orders for the full lifecycle
-- pending → negotiating → accepted → in_transit → delivered | cancelled | failed
COMMENT ON TABLE driver_offers IS 'Stores driver counter-offers for inDrive-style negotiation';
