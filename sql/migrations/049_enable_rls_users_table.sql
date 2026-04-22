-- Migration 049: Enable RLS on public.users table
-- Fix for Supabase security advisor: rls_disabled_in_public
-- All app access to users goes through server-side APIs using service_role,
-- which bypasses RLS. Direct client access must be blocked.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Only the service role (server-side API routes) can read/write users
DO $$
BEGIN
  CREATE POLICY "users_service_role_all"
    ON public.users
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Authenticated users can only read their own row (for profile lookups)
DO $$
BEGIN
  CREATE POLICY "users_read_own"
    ON public.users
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Safety net: catch any other public tables that still lack RLS
-- Run this query manually in SQL Editor to detect remaining issues:
-- SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename NOT IN (
--       SELECT relname FROM pg_class
--       JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
--       WHERE nspname = 'public' AND relrowsecurity = true
--     );
