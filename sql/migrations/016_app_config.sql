-- ============================================================
-- 016: Tabla de configuración global de la app (logo, branding)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- NOTA: El bucket "app-assets" se crea automáticamente desde la API
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_config (
  key        text        PRIMARY KEY,
  value      text        NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Valores por defecto
INSERT INTO public.app_config (key, value) VALUES
  ('logo_url',  '/logo.svg'),
  ('logo_size', '90')
ON CONFLICT (key) DO NOTHING;

-- RLS: cualquiera puede leer, solo service_role escribe
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config lectura pública" ON public.app_config;
CREATE POLICY "app_config lectura pública"
  ON public.app_config FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "app_config solo service_role escribe" ON public.app_config;
CREATE POLICY "app_config solo service_role escribe"
  ON public.app_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

