-- Add client info to orders for driver display (inDrive-style)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_photo TEXT;
