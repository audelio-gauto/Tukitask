-- ============================================================
-- 015: Crear bucket de Supabase Storage para fotos de servicios
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Crear bucket "service-photos" como público
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-photos',
  'service-photos',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Política: cualquiera puede leer (bucket público)
CREATE POLICY "service-photos público lectura"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'service-photos');

-- Política: solo service_role puede insertar (desde el servidor)
CREATE POLICY "service-photos server upload"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'service-photos');
