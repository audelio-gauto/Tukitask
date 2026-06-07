-- ============================================================
-- 103: Campos de taxonomías de catálogo en products
--      Permite guardar marca, etiquetas y atributos elegidos por el vendedor
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand_id BIGINT REFERENCES public.vendor_catalog_taxonomies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tag_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attribute_values JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products (brand_id);
CREATE INDEX IF NOT EXISTS idx_products_tag_ids ON public.products USING GIN (tag_ids);
CREATE INDEX IF NOT EXISTS idx_products_attribute_values ON public.products USING GIN (attribute_values);