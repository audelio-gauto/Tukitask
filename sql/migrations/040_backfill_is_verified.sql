-- Migration 040: Backfill is_verified for clients whose docs were already approved
-- Run this AFTER migration 039 (which adds the is_verified column).
--
-- Scenario: admin approved both client docs before autoVerifyClient code was deployed,
-- or before migration 039 added the is_verified column.
-- This backfills is_verified = true for those clients so the 🛡️ badge appears correctly.

UPDATE client_profiles
SET
  is_verified = true,
  verified_at = COALESCE(verified_at, now()),
  updated_at  = now()
WHERE email IN (
  SELECT driver_email
  FROM driver_documents
  WHERE role = 'client' AND status = 'approved'
  GROUP BY driver_email
  HAVING
    COUNT(CASE WHEN doc_type = 'selfie_cedula' THEN 1 END) > 0
    AND COUNT(CASE WHEN doc_type = 'cedula_frente' THEN 1 END) > 0
)
AND (is_verified = false OR is_verified IS NULL);
