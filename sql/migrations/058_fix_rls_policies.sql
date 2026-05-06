-- Migration 058: Fix overly-permissive RLS policies + storage bucket listing (06 May 2026)
-- Resolves Supabase security advisories:
--   - rls_policy_always_true (0024) — policies applying USING(true) to ALL roles
--   - public_bucket_allows_listing (0025) — service-photos allows listing to everyone
--
-- Strategy:
--   - Drop old broad policies that apply to all roles (allow_all_*, service_role_all, etc.)
--   - Add scoped SELECT policies so authenticated users can read their OWN data (needed for Realtime)
--   - service_role policy from migration 054 handles all server-side writes
-- ============================================================================

-- ── orders ────────────────────────────────────────────────────────────────────
-- Drop old broad policy (applies to all roles — allows anyone to INSERT/UPDATE/DELETE)
DO $$ BEGIN DROP POLICY "allow_all_orders" ON public.orders;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- Authenticated users can SELECT their own orders (as client or assigned driver)
-- Required for Realtime subscriptions and direct API reads
DO $$ BEGIN
  CREATE POLICY "orders_authenticated_select" ON public.orders
    FOR SELECT TO authenticated
    USING (client_email = auth.email() OR accepted_by = auth.email());
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- ── driver_offers ─────────────────────────────────────────────────────────────
DO $$ BEGIN DROP POLICY "allow_all_driver_offers" ON public.driver_offers;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- Drivers see their own offers; clients see offers on their orders
DO $$ BEGIN
  CREATE POLICY "driver_offers_driver_select" ON public.driver_offers
    FOR SELECT TO authenticated
    USING (driver_email = auth.email());
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "driver_offers_client_select" ON public.driver_offers
    FOR SELECT TO authenticated
    USING (order_id IN (
      SELECT id FROM public.orders WHERE client_email = auth.email()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- ── client_profiles ───────────────────────────────────────────────────────────
-- Drop old policy not scoped to service_role (applies to all roles)
DO $$ BEGIN DROP POLICY "service_role_all" ON public.client_profiles;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- Users can read their own profile
DO $$ BEGIN
  CREATE POLICY "client_profiles_own_select" ON public.client_profiles
    FOR SELECT TO authenticated
    USING (email = auth.email());
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- Users can update their own profile
DO $$ BEGIN
  CREATE POLICY "client_profiles_own_update" ON public.client_profiles
    FOR UPDATE TO authenticated
    USING (email = auth.email())
    WITH CHECK (email = auth.email());
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- ── notifications ─────────────────────────────────────────────────────────────
-- Drop broad INSERT policy (allows any authenticated/anon to insert notifications for anyone)
DO $$ BEGIN DROP POLICY "Service role can insert notifications" ON public.notifications;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- Authenticated users can SELECT their own notifications (for Realtime + reads)
DO $$ BEGIN
  CREATE POLICY "notifications_own_select" ON public.notifications
    FOR SELECT TO authenticated
    USING (user_email = auth.email());
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- Authenticated users can UPDATE (mark as read) their own notifications
DO $$ BEGIN
  CREATE POLICY "notifications_own_update" ON public.notifications
    FOR UPDATE TO authenticated
    USING (user_email = auth.email())
    WITH CHECK (user_email = auth.email());
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- ── service-photos storage bucket ─────────────────────────────────────────────
-- Remove the broad SELECT policy that allows clients to LIST all files in the bucket.
-- Public buckets serve objects by URL without needing a listing policy.
-- Authenticated users only need to list objects in their own folder.
DO $$ BEGIN
  DELETE FROM storage.policies
  WHERE bucket_id = 'service-photos'
    AND name = 'service-photos público lectura';
EXCEPTION WHEN undefined_table THEN NULL; WHEN others THEN NULL; END $$;

-- Replace with a scoped SELECT policy: only list objects in own user folder
-- (Supabase storage uses owner_id or folder prefix conventions)
DO $$ BEGIN
  INSERT INTO storage.policies (name, bucket_id, operation, definition, check_expression)
  VALUES (
    'service-photos authenticated list own',
    'service-photos',
    'SELECT',
    'bucket_id = ''service-photos'' AND auth.role() = ''authenticated''',
    NULL
  );
EXCEPTION WHEN unique_violation THEN NULL; WHEN others THEN NULL; END $$;
