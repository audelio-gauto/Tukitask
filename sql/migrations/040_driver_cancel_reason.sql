-- 040_driver_cancel_reason.sql
-- Adds cancel_reason column to orders table for driver-initiated cancellations (driver_cancelled status)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

COMMENT ON COLUMN orders.cancel_reason IS 'Motivo de cancelación por parte del conductor (status: driver_cancelled)';
