-- Migration 090: Agregar política UPDATE en product-images para upsert de logos
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Necesario para que vendedores puedan sobreescribir su logo de tienda (upsert: true)

CREATE POLICY "product-images vendor update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
