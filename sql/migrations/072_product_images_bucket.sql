-- Migration 072: Bucket de Supabase Storage para imágenes de productos
-- Ejecutar en: Supabase Dashboard > SQL Editor

-- Crear bucket "product-images" como público
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,  -- 5 MB máx por imagen
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Política: cualquiera puede leer (bucket público)
CREATE POLICY "product-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Política: vendedores autenticados pueden subir sus propias imágenes
CREATE POLICY "product-images vendor upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Política: vendedores pueden borrar sus propias imágenes
CREATE POLICY "product-images vendor delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
