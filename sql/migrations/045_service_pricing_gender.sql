-- 045: Add gender and is_active columns to service_pricing for dynamic categories
ALTER TABLE public.service_pricing
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'ambos',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill gender based on existing service types
UPDATE public.service_pricing SET gender = 'mujer' WHERE service_type IN ('niera', 'cocina', 'eventos');
UPDATE public.service_pricing SET gender = 'hombre' WHERE service_type IN ('aire_split', 'electrico', 'plomeria', 'cerrajeria');
-- limpieza, cuidado_mascotas, cuidado_adultos, gestor, otros → ambos (default)

-- Allow public read for the service_pricing table (categories are public info)
DROP POLICY IF EXISTS "sp_anon_read" ON public.service_pricing;
CREATE POLICY "sp_anon_read" ON public.service_pricing
  FOR SELECT TO anon USING (TRUE);
