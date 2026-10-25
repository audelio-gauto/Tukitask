-- Fix production RLS for market_orders
-- The previous policies used auth.users, which requires access to the auth.users table
-- and causes "permission denied for table users" for authenticated vendor/client sessions.

DROP POLICY IF EXISTS "market_orders vendor select" ON market_orders;
CREATE POLICY "market_orders vendor select"
  ON market_orders FOR SELECT TO authenticated
  USING (vendor_email = (auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "market_orders client select" ON market_orders;
CREATE POLICY "market_orders client select"
  ON market_orders FOR SELECT TO authenticated
  USING (client_email = (auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "market_orders client insert" ON market_orders;
CREATE POLICY "market_orders client insert"
  ON market_orders FOR INSERT TO authenticated
  WITH CHECK (client_email = (auth.jwt() ->> 'email'));

-- Keep the same security intent but without touching auth.users.
