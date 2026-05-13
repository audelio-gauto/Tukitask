-- ============================================================================
-- Migration 064: Correcciones de Supabase Security Advisor (Performance)
-- Fecha: 2026
--
-- Resuelve tres categorías de advertencias:
--
-- 1. auth_rls_initplan (0013)
--    auth.uid() / auth.email() dentro de USING/WITH CHECK se evalúan UNA VEZ
--    por fila en lugar de una vez por consulta.
--    Fix: envolver en (select auth.uid()) / (select auth.email()).
--
-- 2. multiple_permissive_policies (0011)
--    Múltiples políticas permisivas para el mismo rol+acción en la misma tabla
--    degrada el rendimiento porque PostgreSQL evalúa todas.
--    Fix: consolidar en una sola política por acción con condiciones OR.
--
-- 3. duplicate_index (0003)
--    Índices redundantes que ocupan espacio y ralentizan escrituras.
--    Fix: eliminar los índices duplicados (menos específicos).
-- ============================================================================

-- ============================================================================
-- SECCIÓN 1: POLÍTICAS RLS — auth_rls_initplan + multiple_permissive_policies
-- ============================================================================
-- Estrategia: DROP política antigua → CREATE con (select auth.email()) / (select auth.uid())
-- Las tablas que tienen múltiples políticas permisivas se consolidan en una sola.
-- ============================================================================

-- ── admin_audit_log ──────────────────────────────────────────────────────────
-- auth_rls_initplan: auth.uid() sin subquery
DROP POLICY IF EXISTS "admin_audit_log_read" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_read" ON public.admin_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role::text IN ('admin', 'super_admin', 'owner')
    )
  );

-- ── chat_messages ─────────────────────────────────────────────────────────────
-- auth_rls_initplan + multiple_permissive_policies:
--   "chat_order_participants" (FOR ALL) + "chat_job_participants" (FOR ALL)
--   → consolidar en una sola política "chat_participants"
DROP POLICY IF EXISTS "chat_order_participants" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_job_participants"   ON public.chat_messages;
CREATE POLICY "chat_participants" ON public.chat_messages
  FOR ALL TO authenticated
  USING (
    (order_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = chat_messages.order_id
        AND (o.client_email = (SELECT auth.email())
          OR o.accepted_by  = (SELECT auth.email()))
    ))
    OR
    (job_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tecnico_jobs j
      WHERE j.id = chat_messages.job_id
        AND (j.client_email  = (SELECT auth.email())
          OR j.tecnico_email = (SELECT auth.email()))
    ))
  )
  WITH CHECK (
    sender_email = (SELECT auth.email())
    AND (
      (order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = chat_messages.order_id
          AND (o.client_email = (SELECT auth.email())
            OR o.accepted_by  = (SELECT auth.email()))
      ))
      OR
      (job_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.tecnico_jobs j
        WHERE j.id = chat_messages.job_id
          AND (j.client_email  = (SELECT auth.email())
            OR j.tecnico_email = (SELECT auth.email()))
      ))
    )
  );

-- ── chat_threads ──────────────────────────────────────────────────────────────
-- auth_rls_initplan: auth.email() sin subquery
DROP POLICY IF EXISTS chat_threads_select_own ON public.chat_threads;
DROP POLICY IF EXISTS chat_threads_update_own ON public.chat_threads;
CREATE POLICY chat_threads_select_own ON public.chat_threads
  FOR SELECT
  USING (user_email = (SELECT auth.email()));
CREATE POLICY chat_threads_update_own ON public.chat_threads
  FOR UPDATE
  USING (user_email = (SELECT auth.email()));

-- ── client_profiles ───────────────────────────────────────────────────────────
-- auth_rls_initplan: auth.email() sin subquery
DROP POLICY IF EXISTS "client_profiles_own_select" ON public.client_profiles;
DROP POLICY IF EXISTS "client_profiles_own_update" ON public.client_profiles;
CREATE POLICY "client_profiles_own_select" ON public.client_profiles
  FOR SELECT TO authenticated
  USING (email = (SELECT auth.email()));
CREATE POLICY "client_profiles_own_update" ON public.client_profiles
  FOR UPDATE TO authenticated
  USING     (email = (SELECT auth.email()))
  WITH CHECK (email = (SELECT auth.email()));

-- ── driver_documents ──────────────────────────────────────────────────────────
-- auth_rls_initplan: auth.jwt()->>'email' sin subquery
DROP POLICY IF EXISTS "doc_select_own" ON public.driver_documents;
DROP POLICY IF EXISTS "doc_insert_own" ON public.driver_documents;
CREATE POLICY "doc_select_own" ON public.driver_documents
  FOR SELECT
  USING (driver_email = (SELECT auth.email()));
CREATE POLICY "doc_insert_own" ON public.driver_documents
  FOR INSERT
  WITH CHECK (driver_email = (SELECT auth.email()));

-- ── driver_favorites ─────────────────────────────────────────────────────────
-- auth_rls_initplan + multiple_permissive_policies:
--   "client_manage_own_favs" (FOR ALL) + "driver_see_favs" (FOR SELECT)
--   → dos políticas SELECT para authenticated → consolidar SELECT; separar escritura
DROP POLICY IF EXISTS "client_manage_own_favs" ON public.driver_favorites;
DROP POLICY IF EXISTS "driver_see_favs"         ON public.driver_favorites;
-- SELECT unificado: cliente ve sus favoritos; driver ve quién lo marcó favorito
CREATE POLICY "driver_favorites_select" ON public.driver_favorites
  FOR SELECT TO authenticated
  USING (client_email = (SELECT auth.email())
      OR driver_email = (SELECT auth.email()));
-- Escritura solo del cliente
CREATE POLICY "driver_favorites_insert" ON public.driver_favorites
  FOR INSERT TO authenticated
  WITH CHECK (client_email = (SELECT auth.email()));
CREATE POLICY "driver_favorites_delete" ON public.driver_favorites
  FOR DELETE TO authenticated
  USING (client_email = (SELECT auth.email()));

-- ── driver_feed ───────────────────────────────────────────────────────────────
-- auth_rls_initplan: auth.email() sin subquery
DROP POLICY IF EXISTS driver_feed_select_own ON public.driver_feed;
CREATE POLICY driver_feed_select_own ON public.driver_feed
  FOR SELECT
  USING (driver_email = (SELECT auth.email()));

-- ── driver_locations ─────────────────────────────────────────────────────────
-- multiple_permissive_policies: "driver_own_write" es FOR ALL (incluye SELECT),
-- pero "Public read driver_locations" ya cubre SELECT → el driver tiene dos
-- políticas SELECT permisivas para authenticated.
-- Fix: convertir driver_own_write en políticas de escritura puras.
DROP POLICY IF EXISTS "driver_own_write"         ON public.driver_locations;
DROP POLICY IF EXISTS "Driver updates own location" ON public.driver_locations;
CREATE POLICY "driver_locations_insert" ON public.driver_locations
  FOR INSERT TO authenticated
  WITH CHECK (driver_email = (SELECT auth.email()));
CREATE POLICY "driver_locations_update" ON public.driver_locations
  FOR UPDATE TO authenticated
  USING     (driver_email = (SELECT auth.email()))
  WITH CHECK (driver_email = (SELECT auth.email()));
CREATE POLICY "driver_locations_delete" ON public.driver_locations
  FOR DELETE TO authenticated
  USING (driver_email = (SELECT auth.email()));
-- "Public read driver_locations" (SELECT USING(true)) permanece sin cambios

-- ── driver_offers ─────────────────────────────────────────────────────────────
-- auth_rls_initplan + multiple_permissive_policies:
--   "offer_visibility" + "driver_offers_driver_select" + "driver_offers_client_select"
--   → tres políticas SELECT para authenticated → consolidar en una
DROP POLICY IF EXISTS "offer_visibility"             ON public.driver_offers;
DROP POLICY IF EXISTS "driver_offers_driver_select"  ON public.driver_offers;
DROP POLICY IF EXISTS "driver_offers_client_select"  ON public.driver_offers;
CREATE POLICY "driver_offers_select" ON public.driver_offers
  FOR SELECT TO authenticated
  USING (
    driver_email = (SELECT auth.email())
    OR EXISTS (
      SELECT 1 FROM public.orders
      WHERE public.orders.id = driver_offers.order_id
        AND public.orders.client_email = (SELECT auth.email())
    )
  );

-- ── driver_profiles ───────────────────────────────────────────────────────────
-- multiple_permissive_policies:
--   "dp_own" (FOR ALL, incluye SELECT) + "dp_auth_read" (FOR SELECT USING(true))
--   → dos políticas SELECT permisivas para authenticated
-- Fix: convertir dp_own en escritura pura (SELECT ya cubierto por dp_auth_read)
DROP POLICY IF EXISTS "dp_own" ON public.driver_profiles;
CREATE POLICY "dp_insert" ON public.driver_profiles
  FOR INSERT TO authenticated
  WITH CHECK (email = (SELECT auth.email()));
CREATE POLICY "dp_update" ON public.driver_profiles
  FOR UPDATE TO authenticated
  USING     (email = (SELECT auth.email()))
  WITH CHECK (email = (SELECT auth.email()));
CREATE POLICY "dp_delete" ON public.driver_profiles
  FOR DELETE TO authenticated
  USING (email = (SELECT auth.email()));
-- "dp_auth_read" (FOR SELECT TO authenticated USING(true)) permanece sin cambios

-- ── notifications ─────────────────────────────────────────────────────────────
-- auth_rls_initplan + multiple_permissive_policies:
--   SELECT: "Users can read own notifications" + "notifications_own_select" → dos
--   UPDATE: "Users can mark own notifications read" + "notifications_own_update" → dos
DROP POLICY IF EXISTS "Users can read own notifications"      ON public.notifications;
DROP POLICY IF EXISTS "notifications_own_select"              ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_email = (SELECT auth.email()));

DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;
DROP POLICY IF EXISTS "notifications_own_update"              ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING     (user_email = (SELECT auth.email()))
  WITH CHECK (user_email = (SELECT auth.email()));

-- ── order_stops ───────────────────────────────────────────────────────────────
-- auth_rls_initplan: auth.jwt()->>'email' sin subquery
DROP POLICY IF EXISTS "order_stops_select" ON public.order_stops;
DROP POLICY IF EXISTS "order_stops_update" ON public.order_stops;
CREATE POLICY "order_stops_select" ON public.order_stops
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_stops.order_id
        AND (o.client_email = (SELECT auth.email())
          OR o.accepted_by  = (SELECT auth.email()))
    )
  );
CREATE POLICY "order_stops_update" ON public.order_stops
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_stops.order_id
        AND o.accepted_by = (SELECT auth.email())
    )
  );

-- ── order_tips ────────────────────────────────────────────────────────────────
-- auth_rls_initplan: auth.jwt()->>'email' sin subquery
DROP POLICY IF EXISTS "client_insert_own_tip"  ON public.order_tips;
DROP POLICY IF EXISTS "tip_select_participants" ON public.order_tips;
CREATE POLICY "client_insert_own_tip" ON public.order_tips
  FOR INSERT TO authenticated
  WITH CHECK (client_email = (SELECT auth.email()));
CREATE POLICY "tip_select_participants" ON public.order_tips
  FOR SELECT TO authenticated
  USING (
    client_email = (SELECT auth.email())
    OR driver_email = (SELECT auth.email())
  );

-- ── orders ────────────────────────────────────────────────────────────────────
-- auth_rls_initplan + multiple_permissive_policies:
--   4 políticas SELECT para authenticated → consolidar en una
DROP POLICY IF EXISTS "drivers_see_available_orders"  ON public.orders;
DROP POLICY IF EXISTS "client_sees_own_orders"         ON public.orders;
DROP POLICY IF EXISTS "driver_sees_assigned_orders"    ON public.orders;
DROP POLICY IF EXISTS "orders_authenticated_select"    ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    status IN ('pending', 'negotiating')
    OR client_email = (SELECT auth.email())
    OR accepted_by  = (SELECT auth.email())
  );

-- ── promo_code_uses ───────────────────────────────────────────────────────────
-- auth_rls_initplan: auth.jwt()->>'email' sin subquery
DROP POLICY IF EXISTS "user_see_own_uses" ON public.promo_code_uses;
CREATE POLICY "user_see_own_uses" ON public.promo_code_uses
  FOR SELECT TO authenticated
  USING (user_email = (SELECT auth.email()));

-- ── push_tokens ───────────────────────────────────────────────────────────────
-- auth_rls_initplan: auth.jwt()->>'email' sin subquery
DROP POLICY IF EXISTS "Users can manage own push tokens" ON public.push_tokens;
CREATE POLICY "Users can manage own push tokens" ON public.push_tokens
  FOR ALL
  USING     (user_email = (SELECT auth.email()))
  WITH CHECK (user_email = (SELECT auth.email()));

-- ── tecnico_feed ──────────────────────────────────────────────────────────────
-- auth_rls_initplan: auth.email() sin subquery
DROP POLICY IF EXISTS tecnico_feed_select_own ON public.tecnico_feed;
CREATE POLICY tecnico_feed_select_own ON public.tecnico_feed
  FOR SELECT
  USING (tecnico_email = (SELECT auth.email()));

-- ── tecnico_job_offers ────────────────────────────────────────────────────────
-- auth_rls_initplan + multiple_permissive_policies:
--   "tjo_tecnico_own" (FOR ALL) + "tjo_client_read" (FOR SELECT)
--   → dos SELECT permisivos para authenticated → consolidar
DROP POLICY IF EXISTS "tjo_tecnico_own"  ON public.tecnico_job_offers;
DROP POLICY IF EXISTS "tjo_client_read"  ON public.tecnico_job_offers;
-- SELECT unificado: técnico ve sus ofertas; cliente ve ofertas de sus trabajos
CREATE POLICY "tjo_select" ON public.tecnico_job_offers
  FOR SELECT TO authenticated
  USING (
    tecnico_email = (SELECT auth.email())
    OR job_id IN (
      SELECT id FROM public.tecnico_jobs
      WHERE client_email = (SELECT auth.email())
    )
  );
-- Escritura solo del técnico
CREATE POLICY "tjo_insert" ON public.tecnico_job_offers
  FOR INSERT TO authenticated
  WITH CHECK (tecnico_email = (SELECT auth.email()));
CREATE POLICY "tjo_update" ON public.tecnico_job_offers
  FOR UPDATE TO authenticated
  USING     (tecnico_email = (SELECT auth.email()))
  WITH CHECK (tecnico_email = (SELECT auth.email()));
CREATE POLICY "tjo_delete" ON public.tecnico_job_offers
  FOR DELETE TO authenticated
  USING (tecnico_email = (SELECT auth.email()));

-- ── tecnico_jobs ──────────────────────────────────────────────────────────────
-- auth_rls_initplan + multiple_permissive_policies:
--   "tj_client_own" (FOR ALL) + "tj_tecnico_read" (FOR SELECT) → dos SELECT
--   "tj_client_own" (FOR ALL) + "tj_tecnico_update" (FOR UPDATE) → dos UPDATE
DROP POLICY IF EXISTS "tj_client_own"    ON public.tecnico_jobs;
DROP POLICY IF EXISTS "tj_tecnico_read"  ON public.tecnico_jobs;
DROP POLICY IF EXISTS "tj_tecnico_update" ON public.tecnico_jobs;
-- SELECT unificado: cliente ve sus trabajos; técnico ve pending + los suyos
CREATE POLICY "tj_select" ON public.tecnico_jobs
  FOR SELECT TO authenticated
  USING (
    client_email   = (SELECT auth.email())
    OR status       = 'pending'
    OR tecnico_email = (SELECT auth.email())
  );
-- UPDATE unificado: cliente edita los suyos; técnico edita pending + los suyos
CREATE POLICY "tj_update" ON public.tecnico_jobs
  FOR UPDATE TO authenticated
  USING (
    client_email   = (SELECT auth.email())
    OR status       = 'pending'
    OR tecnico_email = (SELECT auth.email())
  );
-- Escritura del cliente: INSERT y DELETE sobre sus propios trabajos
CREATE POLICY "tj_client_insert" ON public.tecnico_jobs
  FOR INSERT TO authenticated
  WITH CHECK (client_email = (SELECT auth.email()));
CREATE POLICY "tj_client_delete" ON public.tecnico_jobs
  FOR DELETE TO authenticated
  USING (client_email = (SELECT auth.email()));

-- ── tecnico_settings ─────────────────────────────────────────────────────────
-- auth_rls_initplan: auth.email() sin subquery
DROP POLICY IF EXISTS "ts_own" ON public.tecnico_settings;
CREATE POLICY "ts_own" ON public.tecnico_settings
  FOR ALL
  USING (email = (SELECT auth.email()));

-- ── users ─────────────────────────────────────────────────────────────────────
-- auth_rls_initplan + multiple_permissive_policies:
--   "Allow users read" (posible política legacy en dashboard) + "users_read_own"
--   → consolidar en una sola con (select auth.uid())
DROP POLICY IF EXISTS "Allow users read" ON public.users;
DROP POLICY IF EXISTS "users_read_own"   ON public.users;
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

-- ============================================================================
-- SECCIÓN 2: ÍNDICES DUPLICADOS — duplicate_index (0003)
-- Eliminar los índices redundantes (menos específicos o menos descriptivos).
-- Se conservan los índices compuestos y con nombres más descriptivos.
-- ============================================================================

-- chat_messages: conservar idx_chat_messages_order_id
DROP INDEX IF EXISTS public.idx_chat_order;

-- driver_locations: conservar idx_driver_locations_driver_email
DROP INDEX IF EXISTS public.idx_driver_locations_email;

-- driver_offers: conservar idx_driver_offers_driver_email e idx_driver_offers_order_id
DROP INDEX IF EXISTS public.idx_driver_offers_driver;
DROP INDEX IF EXISTS public.idx_driver_offers_order;

-- orders: conservar idx_orders_accepted_by_status e idx_orders_client_email_status
DROP INDEX IF EXISTS public.idx_orders_driver_status;
DROP INDEX IF EXISTS public.idx_orders_client_status;

-- tecnico_jobs: conservar idx_tecnico_jobs_client_email_status,
--               idx_tecnico_jobs_status_created, idx_tecnico_jobs_tecnico_email_status
DROP INDEX IF EXISTS public.idx_tecnico_jobs_client;
DROP INDEX IF EXISTS public.idx_tecnico_jobs_status;
DROP INDEX IF EXISTS public.idx_tecnico_jobs_tecnico;
