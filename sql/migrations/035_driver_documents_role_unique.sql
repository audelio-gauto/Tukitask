-- Migration 035: Fix UNIQUE constraint on driver_documents to include role column.
-- Without role, a user registered as both driver AND tecnico with the same email
-- would corrupt each other's documents on upsert.
--
-- Run in Supabase SQL Editor, then reload schema cache (API → Reload schema).
-- Fully idempotent: safe to re-run even if partially applied before.

-- 1. Drop ALL possibly-existing versions of these constraints first
ALTER TABLE driver_documents DROP CONSTRAINT IF EXISTS driver_documents_driver_email_doc_type_key;
ALTER TABLE driver_documents DROP CONSTRAINT IF EXISTS driver_documents_email_role_doc_type_key;
ALTER TABLE driver_documents DROP CONSTRAINT IF EXISTS driver_documents_role_check;

-- 2. Recreate the correct unique constraint including role
ALTER TABLE driver_documents
  ADD CONSTRAINT driver_documents_email_role_doc_type_key
  UNIQUE (driver_email, role, doc_type);

-- 3. Ensure the role column is NOT NULL with valid values
ALTER TABLE driver_documents
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE driver_documents
  ADD CONSTRAINT driver_documents_role_check
  CHECK (role IN ('driver', 'tecnico'));
