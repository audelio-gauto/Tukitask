-- ============================================================
-- 102: Valores de atributos para catalogo de vendedores
--      Ej: atributo "Color" -> valores "Azul", "Rojo"
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vendor_attribute_values (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attribute_id  BIGINT NOT NULL REFERENCES public.vendor_catalog_taxonomies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attribute_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_vav_attr_order ON public.vendor_attribute_values (attribute_id, sort_order, name);

ALTER TABLE public.vendor_attribute_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vav_service_role" ON public.vendor_attribute_values;
CREATE POLICY "vav_service_role"
  ON public.vendor_attribute_values FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "vav_admin_read" ON public.vendor_attribute_values;
CREATE POLICY "vav_admin_read"
  ON public.vendor_attribute_values FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

GRANT SELECT ON public.vendor_attribute_values TO authenticated;
GRANT ALL ON public.vendor_attribute_values TO service_role;
