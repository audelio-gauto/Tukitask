-- Migration 035: Fix UNIQUE constraint on driver_documents to include role column.
-- Without role, a user registered as both driver AND tecnico with the same email
-- would corrupt each other's documents on upsert.
--
-- Run in Supabase SQL Editor, then reload schema cache (API → Reload schema).

-- 1. Drop the old constraint (name may vary; check with \d driver_documents)
ALTER TABLE driver_documents
  DROP CONSTRAINT IF EXISTS driver_documents_driver_email_doc_type_key;

-- 2. Add the correct unique constraint including role
ALTER TABLE driver_documents
  ADD CONSTRAINT driver_documents_email_role_doc_type_key
  UNIQUE (driver_email, role, doc_type);

-- 3. Ensure the role column has a NOT NULL constraint and valid values
ALTER TABLE driver_documents
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE driver_documents
  ADD CONSTRAINT driver_documents_role_check
  CHECK (role IN ('driver', 'tecnico'));
