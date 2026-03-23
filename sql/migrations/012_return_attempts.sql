-- Migration: Return attempt counter + incident closure
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS return_attempts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incident_closed_at TIMESTAMPTZ;
