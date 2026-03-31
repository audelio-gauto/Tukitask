-- Add client_avg_rating to orders for driver display (inDrive-style)
-- This is the client's historical avg rating shown to driver BEFORE acceptance
-- Separate from client_rating which the driver assigns AFTER delivery
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_avg_rating NUMERIC;
