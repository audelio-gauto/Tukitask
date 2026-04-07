-- 034: Ensure expires_at column exists on driver_documents
-- Safe to run even if already applied (IF NOT EXISTS)
ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Also update the updated_at whenever expires_at is patched
-- (trigger already exists from 033 if you added one; this is a no-op safety run)
