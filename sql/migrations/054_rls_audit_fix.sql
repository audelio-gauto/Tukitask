-- Migration 054: Comprehensive RLS audit & fix (v2 — safe for missing tables)
-- Resolves Supabase security alert "rls_disabled_in_public" (03 May 2026).
--
-- Each table is handled inside a DO block that catches:
--   undefined_table  (42P01) — table doesn't exist yet, skip silently
--   duplicate_object (42710) — policy already exists, skip silently
-- Safe to re-run multiple times.
-- ============================================================================

DO $$ BEGIN ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "orders_service_role" ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.driver_offers ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "driver_offers_service_role" ON public.driver_offers FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.order_stops ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "order_stops_service_role" ON public.order_stops FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pricing_settings_service_role" ON public.pricing_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.vehicle_pricing ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "vehicle_pricing_service_role" ON public.vehicle_pricing FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.package_multipliers ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "package_multipliers_service_role" ON public.package_multipliers FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "app_settings_service_role" ON public.app_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "app_config_service_role" ON public.app_config FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.service_pricing ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_pricing_service_role" ON public.service_pricing FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "users_service_role" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "driver_profiles_service_role" ON public.driver_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "client_profiles_service_role" ON public.client_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.tecnico_settings ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "tecnico_settings_service_role" ON public.tecnico_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.driver_wallets ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "driver_wallets_service_role" ON public.driver_wallets FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "wallet_transactions_service_role" ON public.wallet_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.recharge_requests ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "recharge_requests_service_role" ON public.recharge_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.bank_alias ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bank_alias_service_role" ON public.bank_alias FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "driver_locations_service_role_054" ON public.driver_locations FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.tecnico_jobs ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "tecnico_jobs_service_role" ON public.tecnico_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.tecnico_job_offers ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "tecnico_job_offers_service_role" ON public.tecnico_job_offers FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "notifications_service_role" ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "push_tokens_service_role" ON public.push_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.order_tips ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "order_tips_service_role" ON public.order_tips FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.driver_favorites ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "driver_favorites_service_role" ON public.driver_favorites FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "promo_codes_service_role" ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.promo_code_uses ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "promo_code_uses_service_role" ON public.promo_code_uses FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "chat_messages_service_role" ON public.chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "chat_threads_service_role" ON public.chat_threads FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "reports_service_role" ON public.reports FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_audit_log_service_role" ON public.admin_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "driver_documents_service_role" ON public.driver_documents FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.driver_document_audit ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "driver_document_audit_service_role" ON public.driver_document_audit FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.driver_feed ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "driver_feed_service_role" ON public.driver_feed FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.tecnico_feed ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "tecnico_feed_service_role" ON public.tecnico_feed FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- ── Verification query ───────────────────────────────────────────────────────
-- Run this after executing to confirm 0 unprotected tables remain
-- (spatial_ref_sys from PostGIS is expected and can be ignored):
--
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename NOT IN (
--     SELECT relname FROM pg_class
--     JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
--     WHERE nspname = 'public' AND relrowsecurity = true
--   );

