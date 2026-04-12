-- ============================================================
-- 024: Security & performance fixes
-- ============================================================

-- A-5: Fix RLS on driver_locations — restrict writes to own row only.
-- Previous policy used USING(true) which allowed any authenticated user
-- to overwrite any driver's location.
DROP POLICY IF EXISTS "Driver updates own location" ON driver_locations;

CREATE POLICY "Driver updates own location"
  ON driver_locations FOR ALL
  USING (driver_email = auth.jwt() ->> 'email')
  WITH CHECK (driver_email = auth.jwt() ->> 'email');

-- Service role still needs full access for server-side upserts via API routes
DROP POLICY IF EXISTS "service_role_driver_locations" ON driver_locations;
CREATE POLICY "service_role_driver_locations"
  ON driver_locations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- M-5: Add composite index on orders(status, created_at) for the most frequent query:
-- WHERE status IN ('pending','negotiating') ORDER BY created_at DESC LIMIT 100
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders (status, created_at DESC);

-- Also index orders by accepted_by + status for driver history queries
CREATE INDEX IF NOT EXISTS idx_orders_accepted_by_status
  ON orders (accepted_by, status, created_at DESC);
