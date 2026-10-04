-- 113: Estadísticas de recargas agregadas en SQL (el cálculo en Node quedaba truncado por el límite de filas de PostgREST)

CREATE OR REPLACE FUNCTION public.recharge_request_stats(
  p_emails text[] DEFAULT NULL,
  p_from   text   DEFAULT NULL,
  p_to     text   DEFAULT NULL,
  p_search text   DEFAULT NULL
)
RETURNS TABLE (
  total bigint,
  pending bigint,
  approved bigint,
  rejected bigint,
  total_amount_approved numeric,
  total_amount_pending numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'approved'),
    COUNT(*) FILTER (WHERE status = 'rejected'),
    COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)
  FROM public.recharge_requests
  WHERE (p_emails IS NULL OR driver_email = ANY(p_emails))
    AND (p_from   IS NULL OR created_at >= p_from::timestamptz)
    AND (p_to     IS NULL OR created_at <= p_to::timestamptz)
    AND (p_search IS NULL OR driver_email ILIKE '%' || p_search || '%');
$$;

REVOKE EXECUTE ON FUNCTION public.recharge_request_stats(text[], text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recharge_request_stats(text[], text, text, text) TO service_role;
