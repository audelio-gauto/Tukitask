-- Migration 039: Client identity verification
-- Allows clients to optionally upload two documents for identity verification.
-- When both are approved by admin, client_profiles.is_verified is set to true
-- and a "✅ Verificado" badge appears on their profile.

-- ── 1. Allow 'client' role in driver_documents ─────────────────────────────
-- The table currently CHECKs role IN ('driver', 'tecnico').
-- We extend it to also accept 'client'.
ALTER TABLE driver_documents DROP CONSTRAINT IF EXISTS driver_documents_role_check;

ALTER TABLE driver_documents
  ADD CONSTRAINT driver_documents_role_check
  CHECK (role IN ('driver', 'tecnico', 'client'));

-- ── 2. Add is_verified flag to client_profiles ─────────────────────────────
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS is_verified  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS verified_at  TIMESTAMPTZ;

-- ── 3. Index for fast lookup of client docs ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_driver_documents_client_email
  ON driver_documents (driver_email)
  WHERE role = 'client';
