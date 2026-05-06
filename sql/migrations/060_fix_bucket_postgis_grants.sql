-- Migration 060: Fix bucket privacy + direct REVOKE on PostGIS functions (06 May 2026)
-- Resolves remaining warnings after migration 059:
--
--   Fix 1: public_bucket_allows_listing
--     Root cause: storage bucket 'service-photos' has public=true. Any SELECT
--     policy on a public bucket triggers the listing warning. Solution: make
--     the bucket private. The existing "service-photos authenticated read"
--     policy already limits access to authenticated users.
--
--   Fix 2: st_estimatedextent anon/authenticated exposure
--     Root cause: ALTER EXTENSION postgis SET SCHEMA extensions requires
--     superuser privileges not available in Supabase managed instances.
--     Direct REVOKE FROM PUBLIC is the fallback — PostgreSQL allows revoking
--     PUBLIC grants on extension-owned functions from the postgres role.
--
--   Note: authenticated_security_definer_function_executable warnings for
--     accept_offer, accept_tecnico_offer, record_driver_dismiss, record_driver_offer,
--     recompute_acceptance_rate — these are INTENTIONAL. Authenticated users
--     (clients/drivers) call these functions directly via supabase.rpc().
--     The warnings are informational only; access is already restricted
--     (anon access was revoked in migration 059). No action needed.
--
--   Note: extension_in_public (postgis) — unfixable in Supabase managed
--     instances without superuser. Accept this advisory or contact Supabase support.
--
--   Note: auth_leaked_password_protection — Dashboard only:
--     Authentication → Password Settings → Enable "Check for leaked passwords"
-- ============================================================================

-- ── 1. Make service-photos bucket private ────────────────────────────────────
-- A private bucket requires a policy for URL access (the authenticated SELECT
-- policy created in 059 covers this). The public_bucket_allows_listing warning
-- only fires for buckets with public=true + a SELECT policy.

UPDATE storage.buckets
SET public = false
WHERE id = 'service-photos';

-- ── 2. REVOKE FROM PUBLIC on PostGIS st_estimatedextent ──────────────────────
-- Direct REVOKE — fallback since ALTER EXTENSION SET SCHEMA requires superuser.
-- These functions have no use case for anonymous or unauthenticated callers.

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text) FROM PUBLIC;
EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text) FROM PUBLIC;
EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text, boolean) FROM PUBLIC;
EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN undefined_function THEN NULL; END $$;
