-- 125: Hardening de pedidos, ofertas, trabajos técnicos y tiempo real
--
-- Contrato: todas las escrituras de estas tablas pasan por API routes con
-- service_role. El cliente solo necesita SELECT (y Realtime) de SUS filas.
-- Cerrar INSERT/UPDATE/DELETE directos evita mass assignment, auto-aprobación,
-- manipulación de estados y bypass de reglas de negocio.
--
-- Ejecutar DESPUÉS de 124_wallet_security_hardening.sql.
-- No borra datos.

BEGIN;

-- ── 1. Revocar escrituras directas a anon/authenticated ─────────────────────
DO $$
DECLARE
  tables text[] := ARRAY[
    'orders',
    'order_stops',
    'order_tips',
    'driver_offers',
    'tecnico_jobs',
    'tecnico_job_offers',
    'market_orders',
    'driver_locations',
    'driver_feed',
    'tecnico_feed',
    'notifications',
    'push_tokens',
    'chat_threads',
    'chat_messages',
    'client_profiles',
    'product_reviews',
    'sos_alerts',
    'reports',
    'trip_shares',
    'tukibot_negotiations',
    'tukibot_negotiation_messages'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ── 2. orders: solo cliente asignado o driver asignado pueden leer ──────────
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    client_email = (SELECT auth.email())
    OR accepted_by = (SELECT auth.email())
  );

-- ── 3. tecnico_jobs: solo cliente dueño o técnico asignado ──────────────────
DROP POLICY IF EXISTS "tj_select"        ON public.tecnico_jobs;
DROP POLICY IF EXISTS "tj_update"        ON public.tecnico_jobs;
DROP POLICY IF EXISTS "tj_client_insert" ON public.tecnico_jobs;
DROP POLICY IF EXISTS "tj_client_delete" ON public.tecnico_jobs;
CREATE POLICY "tj_select" ON public.tecnico_jobs
  FOR SELECT TO authenticated
  USING (
    client_email   = (SELECT auth.email())
    OR tecnico_email = (SELECT auth.email())
  );

-- ── 4. driver_locations: solo el propio driver puede leer ───────────────────
DROP POLICY IF EXISTS "Public read driver_locations" ON public.driver_locations;
DROP POLICY IF EXISTS "driver_locations_select"      ON public.driver_locations;
CREATE POLICY "driver_locations_select" ON public.driver_locations
  FOR SELECT TO authenticated
  USING (driver_email = (SELECT auth.email()));

-- ── 5. market_orders: el checkout es server-side ────────────────────────────
DROP POLICY IF EXISTS "market_orders client insert" ON public.market_orders;

-- ── 6. notifications: marcar leídas pasa por /api/notifications ─────────────
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;

-- ── 7. Realtime confiable para filtros por email ────────────────────────────
-- DELETE/UPDATE necesitan la fila vieja completa para evaluar el filtro.
ALTER TABLE public.driver_feed   REPLICA IDENTITY FULL;
ALTER TABLE public.tecnico_feed  REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.driver_wallets REPLICA IDENTITY FULL;

-- Asegurar que las tablas del feed estén publicadas (idempotente).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['driver_feed', 'tecnico_feed', 'notifications'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
