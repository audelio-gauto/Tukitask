-- Migration 057: Fix function_search_path_mutable + REVOKE anon from SECURITY DEFINER functions
-- Resolves Supabase security advisories (06 May 2026):
--   - function_search_path_mutable  (0011)
--   - anon_security_definer_function_executable (0028)
--   - authenticated_security_definer_function_executable (0029) — for admin/internal functions only
--
-- All statements wrapped in DO blocks — safe to re-run.
-- ============================================================================

-- ── 1. Fix search_path on all user-defined functions ─────────────────────────
-- ALTER FUNCTION ... SET search_path = public locks the function to the public
-- schema regardless of the caller's search_path, preventing injection attacks.

DO $$ BEGIN ALTER FUNCTION public.accept_offer(uuid, text) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.accept_tecnico_offer(uuid, text) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.approve_recharge(uuid, text) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.cleanup_old_notifications() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.deduct_commission(uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.deduct_commission_job(uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.deduct_tecnico_commission(uuid, text, numeric) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.expire_stale_offers() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.fn_cleanup_stale_data() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.fn_haversine_km(double precision, double precision, double precision, double precision) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.fn_match_driver_feed(uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.fn_match_tecnico_feed(uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.get_driver_doc_groups(text, text, text, integer) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.recompute_acceptance_rate(text) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.record_driver_dismiss(text) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.record_driver_offer(text, integer) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.refresh_driver_feed(text) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.refresh_tecnico_feed(text) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.reject_recharge(uuid, text, text) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.safe_emit_notification(text, text, text, text, text, text, jsonb) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.set_updated_at() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.trg_orders_feed_sync() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.trg_tecnico_jobs_feed_sync() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN ALTER FUNCTION public.rls_auto_enable() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ── 2. REVOKE EXECUTE FROM anon — no anonymous call should reach these ────────
-- All these functions are called server-side via service_role (Next.js API routes).
-- Revoking from anon prevents unauthenticated abuse via /rest/v1/rpc/.

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.accept_offer(uuid, text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.accept_tecnico_offer(uuid, text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.approve_recharge(uuid, text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.cleanup_old_notifications() FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.deduct_commission(uuid) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.deduct_commission_job(uuid) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.deduct_tecnico_commission(uuid, text, numeric) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.expire_stale_offers() FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.fn_cleanup_stale_data() FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.fn_match_driver_feed(uuid) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.fn_match_tecnico_feed(uuid) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.get_driver_doc_groups(text, text, text, integer) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.recompute_acceptance_rate(text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.record_driver_dismiss(text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.record_driver_offer(text, integer) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.refresh_driver_feed(text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.refresh_tecnico_feed(text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.reject_recharge(uuid, text, text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.safe_emit_notification(text, text, text, text, text, text, jsonb) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ── 3. REVOKE EXECUTE FROM authenticated — admin/internal functions only ──────
-- These functions are admin-only or internal cron operations.
-- authenticated users (drivers/clients) must never call them directly.

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.approve_recharge(uuid, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.reject_recharge(uuid, text, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.deduct_commission(uuid) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.deduct_commission_job(uuid) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.deduct_tecnico_commission(uuid, text, numeric) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.expire_stale_offers() FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.fn_cleanup_stale_data() FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.cleanup_old_notifications() FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.get_driver_doc_groups(text, text, text, integer) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.safe_emit_notification(text, text, text, text, text, text, jsonb) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
