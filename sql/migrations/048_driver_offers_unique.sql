-- Migration: add UNIQUE constraint on driver_offers (order_id, driver_email)
-- Prevents duplicate offers from the same driver on the same order (race condition fix)

-- Remove duplicate rows first, keeping only the most recent offer per (order_id, driver_email)
DELETE FROM driver_offers
WHERE id NOT IN (
  SELECT DISTINCT ON (order_id, driver_email) id
  FROM driver_offers
  ORDER BY order_id, driver_email, created_at DESC
);

-- Add unique constraint
ALTER TABLE driver_offers
  ADD CONSTRAINT uq_driver_offers_order_driver
  UNIQUE (order_id, driver_email);
