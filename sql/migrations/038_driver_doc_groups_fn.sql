-- Migration 038: Cursor-based pagination helper for driver document groups
-- Used by GET /api/admin/documents?view=drivers to paginate unique (email, role) pairs
-- without fetching millions of doc rows at once.

-- DISTINCT ON (driver_email, role) returns exactly one row per unique combo.
-- Cursor is a compound key: (driver_email, role) — both fields needed for stable pagination.

CREATE OR REPLACE FUNCTION get_driver_doc_groups(
  p_role         text DEFAULT 'all',
  p_cursor_email text DEFAULT '',
  p_cursor_role  text DEFAULT '',
  p_limit        int  DEFAULT 31          -- caller passes PAGE_SIZE + 1 to detect hasMore
)
RETURNS TABLE (driver_email text, drole text)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (dd.driver_email, dd.role)
         dd.driver_email,
         dd.role AS drole
  FROM   driver_documents dd
  WHERE  (p_role = 'all' OR dd.role = p_role)
    AND  (
           p_cursor_email = ''
           OR dd.driver_email > p_cursor_email
           OR (dd.driver_email = p_cursor_email AND dd.role > p_cursor_role)
         )
  ORDER BY dd.driver_email ASC, dd.role ASC
  LIMIT  p_limit;
$$;

-- Grant execute to the service role (used by sbAdmin())
-- Supabase service role bypasses RLS, so no additional grant needed.
-- If you also want anon/authenticated roles to call it, add:
-- GRANT EXECUTE ON FUNCTION get_driver_doc_groups TO authenticated;
