-- ============================================================
-- 101: Taxonomias de catalogo para panel de vendedores (admin)
--      - categorias, marcas, atributos, etiquetas
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vendor_catalog_taxonomies (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  taxonomy_type TEXT NOT NULL CHECK (taxonomy_type IN ('category', 'brand', 'attribute', 'tag')),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (taxonomy_type, slug)
);

CREATE INDEX IF NOT EXISTS idx_vct_type_order ON public.vendor_catalog_taxonomies (taxonomy_type, sort_order, name);

ALTER TABLE public.vendor_catalog_taxonomies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vct_service_role" ON public.vendor_catalog_taxonomies;
CREATE POLICY "vct_service_role"
  ON public.vendor_catalog_taxonomies FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "vct_admin_read" ON public.vendor_catalog_taxonomies;
CREATE POLICY "vct_admin_read"
  ON public.vendor_catalog_taxonomies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

GRANT SELECT ON public.vendor_catalog_taxonomies TO authenticated;
GRANT ALL ON public.vendor_catalog_taxonomies TO service_role;
