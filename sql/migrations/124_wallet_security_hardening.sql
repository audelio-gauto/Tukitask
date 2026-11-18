-- ============================================================
-- 124: Endurecimiento de seguridad de billeteras y comisiones
--
-- Sólo cambios de permisos. No modifica la UI del admin, ni la
-- lógica de ajustes manuales, ni el flujo de recargas.
--
-- Objetivo:
--   1) Evitar que anon/authenticated ejecuten RPCs sensibles por
--      PostgREST (crear saldo, cobrar comisiones, aceptar ofertas).
--   2) Evitar que un usuario escriba directo en tablas sensibles
--      (saldo, historial, solicitudes, verificación y comisiones).
--   3) Fijar search_path en las RPCs de billetera vendedor.
--
-- Todas las llamadas legítimas de la app pasan por API routes con
-- service_role, por lo que estos REVOKE no cambian funcionalidad.
-- ============================================================

-- ── 1. RPCs de billetera vendedor: sólo service_role ─────────
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.deduct_vendor_commission(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.deduct_vendor_commission(uuid) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.approve_vendor_recharge(uuid, text) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.approve_vendor_recharge(uuid, text) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.reject_vendor_recharge(uuid, text, text) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.reject_vendor_recharge(uuid, text, text) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ── 2. Aceptar ofertas: sólo server-side (service_role) ──────
-- La API ya usa service_role y toma el email del token.
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.accept_offer(uuid, text) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.accept_offer(uuid, text) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.accept_tecnico_offer(uuid, text) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.accept_tecnico_offer(uuid, text) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ── 3. Estadísticas de matching: email sólo desde el token ───
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.record_driver_offer(text, integer) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.record_driver_offer(text, integer) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.record_driver_dismiss(text) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.record_driver_dismiss(text) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ── 4. search_path fijo en RPCs de billetera vendedor ────────
DO $$ BEGIN
  ALTER FUNCTION public.deduct_vendor_commission(uuid) SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.approve_vendor_recharge(uuid, text) SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.reject_vendor_recharge(uuid, text, text) SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ── 5. Tablas de billetera: escritura sólo service_role ──────
-- Los usuarios conservan SELECT (sus propias filas vía RLS).
REVOKE INSERT, UPDATE, DELETE ON public.driver_wallets            FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_transactions       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.recharge_requests         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.vendor_wallets            FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.vendor_wallet_transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.vendor_recharge_requests  FROM anon, authenticated;

-- ── 6. Perfiles sensibles: escritura sólo vía API (service_role) ──
-- Evita autoverificación, autoaprobación de documentos y cambios
-- de comisión desde PostgREST. La app ya escribe por API.
REVOKE INSERT, UPDATE, DELETE ON public.driver_profiles   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.tecnico_settings  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.driver_documents  FROM anon, authenticated;

COMMENT ON TABLE public.driver_documents IS
  'Documentos KYC. Escritura sólo service_role; uploads vía /api/upload-driver-doc.';
