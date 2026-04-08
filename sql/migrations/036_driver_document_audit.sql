-- Migration 036: Audit log for admin document review actions
-- Tracks every approve / reject action per document

CREATE TABLE IF NOT EXISTS driver_document_audit (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  doc_id           uuid        NOT NULL,
  driver_email     text        NOT NULL,
  doc_type         text        NOT NULL,
  action           text        NOT NULL CHECK (action IN ('approved', 'rejected', 'pending')),
  admin_email      text        NOT NULL,
  rejection_reason text,
  created_at       timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS driver_document_audit_doc_id_idx      ON driver_document_audit(doc_id);
CREATE INDEX IF NOT EXISTS driver_document_audit_driver_email_idx ON driver_document_audit(driver_email);
CREATE INDEX IF NOT EXISTS driver_document_audit_created_at_idx   ON driver_document_audit(created_at DESC);

-- Only the service role (used by server-side admin routes) can read / write.
-- Regular authenticated users have no access.
ALTER TABLE driver_document_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_service_only" ON driver_document_audit;
CREATE POLICY "admin_service_only" ON driver_document_audit USING (false);
