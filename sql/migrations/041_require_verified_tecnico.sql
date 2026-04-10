-- Migration 041: Add require_verified_tecnico to tecnico_jobs
-- Allows clients to request only identity-verified professionals

ALTER TABLE tecnico_jobs
  ADD COLUMN IF NOT EXISTS require_verified_tecnico BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tecnico_jobs.require_verified_tecnico IS
  'When true, the job is only visible to tecnico_settings rows where is_verified = true';
