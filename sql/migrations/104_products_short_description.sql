-- ============================================================
-- 104: Descripción corta en products
--      Agrega short_description (resumen visible en tarjetas)
--      y renombra description → long_description de forma no destructiva
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS short_description TEXT;

-- Índice de texto completo para búsqueda
CREATE INDEX IF NOT EXISTS idx_products_short_description
  ON public.products USING GIN (to_tsvector('spanish', coalesce(short_description, '')));

COMMENT ON COLUMN public.products.short_description IS
  'Resumen corto del producto (≤300 chars). Se muestra en tarjetas y debajo del precio en la ficha.';

COMMENT ON COLUMN public.products.description IS
  'Descripción larga del producto — detalles completos, características, materiales, garantía.';
