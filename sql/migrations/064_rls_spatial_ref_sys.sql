-- Migration 064: Enable RLS on PostGIS system table spatial_ref_sys (May 2026)
--
-- Supabase Security Advisor reports:
--   rls_disabled_in_public → public.spatial_ref_sys
--
-- spatial_ref_sys is a PostGIS extension table (coordinate reference systems).
-- The app never queries it directly — PostGIS uses it internally via server-side
-- functions. Enabling RLS with no policies blocks all Data API access (anon /
-- authenticated via PostgREST) while PostGIS internal calls are unaffected
-- (they run as superuser / postgres role, which bypasses RLS).
-- ============================================================================

ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

-- No policies needed: zero-policy RLS = deny all via PostgREST.
-- PostGIS functions (ST_Transform, ST_SetSRID, etc.) still work normally.
