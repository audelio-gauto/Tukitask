-- 052_driver_rate_thresholds.sql
-- Adds per-vehicle-type Gs/km profitability thresholds to vehicle_pricing.
-- NULL = feature disabled for that vehicle (feed shows no Gs/km badge).

ALTER TABLE vehicle_pricing
  ADD COLUMN IF NOT EXISTS rate_good_gspm NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rate_ok_gspm   NUMERIC(10,2) DEFAULT NULL;

-- Ensure the four main vehicle types exist (idempotent)
INSERT INTO vehicle_pricing (vehicle_type, label, emoji, base_price, price_per_km, sort_order)
VALUES
  ('moto',      'Moto',          '🏍️', NULL, NULL, 1),
  ('auto',      'Auto',          '🚗', NULL, NULL, 2),
  ('motocarro', 'Moto carro',    '🛺', NULL, NULL, 3),
  ('camion2t',  'Camión 2T',     '🚛', NULL, NULL, 4)
ON CONFLICT (vehicle_type) DO NOTHING;
