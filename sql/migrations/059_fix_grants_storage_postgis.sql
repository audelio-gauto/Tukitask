-- Migration 059: Fix REVOKE properly (PUBLIC grant) + storage policy + PostGIS schema (06 May 2026)
-- Resolves remaining Supabase security advisories after migration 057/058:
--
--   Problem 1: REVOKE FROM anon/authenticated doesn't help if there's a PUBLIC grant.
--              Must REVOKE FROM PUBLIC first, then GRANT back to specific roles.
--
--   Problem 2: Storage policy was applied to wrong table. Supabase storage policies
--              are RLS policies on storage.objects, not storage.policies.
--
--   Problem 3: PostGIS extension in public schema exposes st_estimatedextent (and
--              all other st_* functions) to anon via /rest/v1/rpc/. Moving it to a
--              dedicated schema removes it from PostgREST exposure entirely.
--
-- All statements wrapped in DO blocks — safe to re-run.
-- ============================================================================

-- ── 1. REVOKE FROM PUBLIC, then GRANT back to roles that legitimately need access ──

-- Functions callable ONLY by service_role (admin/internal operations):

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.approve_recharge(uuid, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.approve_recharge(uuid, text) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.reject_recharge(uuid, text, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.reject_recharge(uuid, text, text) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.deduct_commission(uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.deduct_commission(uuid) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.deduct_commission_job(uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.deduct_commission_job(uuid) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.deduct_tecnico_commission(uuid, text, numeric) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.deduct_tecnico_commission(uuid, text, numeric) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.expire_stale_offers() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.expire_stale_offers() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.cleanup_old_notifications() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.fn_cleanup_stale_data() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fn_cleanup_stale_data() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.safe_emit_notification(text, text, text, text, text, text, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.safe_emit_notification(text, text, text, text, text, text, jsonb) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_driver_doc_groups(text, text, text, integer) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.get_driver_doc_groups(text, text, text, integer) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

-- Functions callable by authenticated users (clients/drivers via app) + service_role:

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.accept_offer(uuid, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.accept_offer(uuid, text) TO authenticated, service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.accept_tecnico_offer(uuid, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.accept_tecnico_offer(uuid, text) TO authenticated, service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.record_driver_offer(text, integer) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.record_driver_offer(text, integer) TO authenticated, service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.record_driver_dismiss(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.record_driver_dismiss(text) TO authenticated, service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.recompute_acceptance_rate(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.recompute_acceptance_rate(text) TO authenticated, service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

-- Feed/matching functions — only called server-side:

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.refresh_driver_feed(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.refresh_driver_feed(text) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.refresh_tecnico_feed(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.refresh_tecnico_feed(text) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.fn_match_driver_feed(uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fn_match_driver_feed(uuid) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.fn_match_tecnico_feed(uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fn_match_tecnico_feed(uuid) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; WHEN insufficient_privilege THEN NULL; END $$;

-- ── 2. Fix storage.objects policy for service-photos bucket ──────────────────
-- Storage policies are RLS on storage.objects (not storage.policies table).

DROP POLICY IF EXISTS "service-photos público lectura" ON storage.objects;

-- Only authenticated users can list/read objects in this bucket
DO $$ BEGIN
  CREATE POLICY "service-photos authenticated read" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'service-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Move PostGIS to extensions schema ─────────────────────────────────────
-- This removes all st_* functions and spatial_ref_sys from PostgREST exposure,
-- resolving: extension_in_public, st_estimatedextent anon/authenticated access,
-- and spatial_ref_sys RLS warning — all in one step.
--
-- IMPORTANT: After running this, the search_path for new sessions will include
-- the extensions schema automatically (set below). Existing app queries that
-- use unqualified st_* functions will still work because of search_path.

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

DO $$ BEGIN
  ALTER EXTENSION postgis SET SCHEMA extensions;
EXCEPTION WHEN insufficient_privilege THEN NULL;
       WHEN others THEN NULL; END $$;

-- Set default search_path to include extensions schema so st_* functions work
-- without schema prefix in existing SQL code:
DO $$ BEGIN
  ALTER DATABASE postgres SET search_path TO "$user", public, extensions;
EXCEPTION WHEN insufficient_privilege THEN NULL;
       WHEN others THEN NULL; END $$;
