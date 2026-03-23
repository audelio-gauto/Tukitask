-- Migration: Failed delivery / return flow
-- New statuses: failed → returning → driver_returning → return_delivered → returned | return_rejected

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fail_reason TEXT,
  ADD COLUMN IF NOT EXISTS return_rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS returning_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
