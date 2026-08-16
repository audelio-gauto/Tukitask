-- Migration 111: allow vendor verification docs in driver_documents
-- Root cause: the DB CHECK constraint still allows only driver, tecnico, client.
-- Seller uploads were being rejected before they could reach admin review.

ALTER TABLE driver_documents DROP CONSTRAINT IF EXISTS driver_documents_role_check;

ALTER TABLE driver_documents
  ADD CONSTRAINT driver_documents_role_check
  CHECK (role IN ('driver', 'tecnico', 'client', 'vendedor'));

-- Optional but recommended: ensure the vendor docs are indexable for admin review.
CREATE INDEX IF NOT EXISTS idx_driver_documents_vendor_email
  ON driver_documents (driver_email)
  WHERE role = 'vendedor';
