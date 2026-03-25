-- ============================================================
-- 016: Tabla de configuración global de la app (logo, branding, etc.)
-- Ejecutar en: Supabase Dashboard > SQL Editor
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

-- Solo el service_role puede modificar
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config lectura pública"
  ON public.app_config FOR SELECT
  USING (true);

CREATE POLICY "app_config solo service_role escribe"
  ON public.app_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Bucket para assets de la app (logo, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-assets',
  'app-assets',
  true,
  2097152,  -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "app-assets lectura pública"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'app-assets');

CREATE POLICY "app-assets service_role upload"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'app-assets');

CREATE POLICY "app-assets service_role update"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'app-assets');
