-- 025 · Add distance_km and note to driver_offers (if not already present)
ALTER TABLE driver_offers ADD COLUMN IF NOT EXISTS distance_km NUMERIC(6,2) DEFAULT NULL;
ALTER TABLE driver_offers ADD COLUMN IF NOT EXISTS note        TEXT         DEFAULT NULL;
ALTER TABLE driver_offers ADD COLUMN IF NOT EXISTS client_email TEXT        DEFAULT NULL;
