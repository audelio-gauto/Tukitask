-- 114: Índices trigram para la búsqueda parcial (ilike '%texto%') de /api/tienda/products
-- Solo cubre productos publicados, que es el único filtro que usa esa consulta.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$
DECLARE
  ext_schema text;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING GIN (name %I.gin_trgm_ops) WHERE status = ''published''',
    ext_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_products_category_trgm ON public.products USING GIN (category %I.gin_trgm_ops) WHERE status = ''published''',
    ext_schema
  );
END $$;
