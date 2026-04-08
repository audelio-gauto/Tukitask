-- Migration 037: Remove deprecated/orphaned document types from driver_documents
-- These doc_types were removed from the allowed lists in previous migrations/code changes
-- but their existing DB records were never cleaned up.

-- ─────────────────────────────────────────────────────────────────────────────
-- Types that are no longer valid and must be deleted:
--   cedula_dorso          → back of personal ID card (removed — not required)
--   foto_cedula_dorso     → alias used in some early builds
--   {prefix}_foto_1       → old extra vehicle photos (moto_foto_1, auto_foto_1, …)
--   {prefix}_foto_2       → old extra vehicle photos
--   selfie_cedula for role='driver' → selfie is only required for tecnico, not driver
-- ─────────────────────────────────────────────────────────────────────────────

-- Capture the file_paths before deleting so we know what to delete from storage
-- (run storage cleanup separately from Supabase dashboard or Edge Function if needed)
DO $$
DECLARE
  deprecated_count integer;
BEGIN
  SELECT COUNT(*) INTO deprecated_count
  FROM driver_documents
  WHERE doc_type = 'cedula_dorso'
     OR doc_type = 'foto_cedula_dorso'
     OR doc_type LIKE '%_foto_1'
     OR doc_type LIKE '%_foto_2'
     OR (doc_type = 'selfie_cedula' AND role = 'driver');

  RAISE NOTICE 'Found % deprecated document records to delete', deprecated_count;
END $$;

-- Delete deprecated records
DELETE FROM driver_documents
WHERE doc_type = 'cedula_dorso'
   OR doc_type = 'foto_cedula_dorso'
   OR doc_type LIKE '%_foto_1'
   OR doc_type LIKE '%_foto_2'
   OR (doc_type = 'selfie_cedula' AND role = 'driver');

-- Also delete any audit records for those docs (cascade safety)
DELETE FROM driver_document_audit
WHERE doc_type = 'cedula_dorso'
   OR doc_type = 'foto_cedula_dorso'
   OR doc_type LIKE '%_foto_1'
   OR doc_type LIKE '%_foto_2';
