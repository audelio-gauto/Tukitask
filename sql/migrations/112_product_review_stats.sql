-- 112: Agregados de reseñas calculados en SQL (evita descargar todas las filas en /api/tienda/products)

CREATE OR REPLACE FUNCTION public.product_review_stats(p_product_ids uuid[])
RETURNS TABLE (product_id uuid, avg_rating numeric, review_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT r.product_id, AVG(r.rating)::numeric, COUNT(*)
  FROM public.product_reviews r
  WHERE r.product_id = ANY(p_product_ids)
  GROUP BY r.product_id;
$$;

REVOKE EXECUTE ON FUNCTION public.product_review_stats(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_review_stats(uuid[]) TO service_role;
