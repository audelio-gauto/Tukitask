-- Migration 066: Mandadito payment proof flow
-- Adds columns to track payment transfer from client to driver and ticket photo.
-- Does NOT affect envio / remis / flete orders (columns nullable, unused for other types).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,     -- screenshot of client's transfer, uploaded by client
  ADD COLUMN IF NOT EXISTS actual_amount     BIGINT,   -- real purchase amount, entered by driver after buying
  ADD COLUMN IF NOT EXISTS ticket_photo_url  TEXT;     -- photo of purchase receipt, uploaded by driver

COMMENT ON COLUMN orders.payment_proof_url IS 'Mandadito: screenshot of payment transfer uploaded by client';
COMMENT ON COLUMN orders.actual_amount     IS 'Mandadito: actual amount spent by driver at the store, in Gs';
COMMENT ON COLUMN orders.ticket_photo_url  IS 'Mandadito: photo of the purchase receipt uploaded by driver';
