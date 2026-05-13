-- Migration 062: Explicit table GRANTs for Supabase Data API compatibility (May 2026)
--
-- Background:
--   Starting May 30, 2026  → new projects require explicit GRANTs on public schema tables.
--   Starting October 30, 2026 → enforced on ALL existing projects (including this one).
--
--   Reference: https://supabase.com/docs/guides/database/postgres/grants
--
-- Strategy:
--   - GRANT SELECT, INSERT, UPDATE, DELETE on all app tables to `authenticated` and `service_role`.
--   - GRANT SELECT only (on read-only config tables) to `anon` — so the app can fetch
--     pricing/config before the user completes login if needed.
--   - RLS policies (already in place) enforce the actual per-row security.
--     These GRANTs only determine whether a role can attempt an operation at all.
--
-- Tablas verificadas en la base de datos el 13 Mayo 2026.
-- GRANTs directos (sin DO blocks) — todas estas tablas existen confirmado.
-- ============================================================================

-- ── Core order/delivery tables ────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders             TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_stops        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_tips         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_offers      TO authenticated, service_role;

-- ── User profiles ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users              TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_profiles    TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_profiles    TO authenticated, service_role;

-- ── Tecnico (técnicos de servicio) ───────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tecnico_jobs       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tecnico_job_offers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tecnico_settings   TO authenticated, service_role;

-- ── Real-time feed tables ─────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_feed        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tecnico_feed       TO authenticated, service_role;

-- ── Wallet / pagos ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_wallets     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_transactions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recharge_requests  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_alias         TO authenticated, service_role;

-- ── Notificaciones & mensajería ───────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_threads       TO authenticated, service_role;

-- ── Documentos & verificación de drivers ─────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_documents      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_document_audit TO authenticated, service_role;

-- ── Ubicación en tiempo real ──────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_locations   TO authenticated, service_role;

-- ── Favoritos ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_favorites   TO authenticated, service_role;

-- ── Códigos promocionales ─────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_code_uses    TO authenticated, service_role;

-- ── Config / precios (también legible por anon antes del login) ───────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_settings   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_pricing    TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_pricing    TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_config         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings       TO authenticated, service_role;

-- anon: solo lectura en tablas de config/precios (necesario antes del login)
GRANT SELECT ON public.vehicle_pricing  TO anon;
GRANT SELECT ON public.service_pricing  TO anon;
GRANT SELECT ON public.pricing_settings TO anon;
GRANT SELECT ON public.app_config       TO anon;

-- ── Admin / auditoría ─────────────────────────────────────────────────────────
-- La política RLS restringe el acceso real solo a usuarios con rol admin.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_log TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports         TO authenticated, service_role;

-- ── NOTA: package_multipliers ─────────────────────────────────────────────────
-- Esta tabla NO existe en la base de datos actual (migración 004 no ejecutada).
-- La app la maneja con fallback: `multipliers.data || []`
-- Si se crea en el futuro, agregar:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_multipliers TO authenticated, service_role;
--   GRANT SELECT ON public.package_multipliers TO anon;
