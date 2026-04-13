-- Migration 024: Delivery photo proof
-- Adds delivery_photo_url column to orders and creates storage bucket

-- Add column to store delivery proof photo URL
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_photo_url TEXT;

-- Create storage bucket for delivery proofs (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'delivery-proofs',
  'delivery-proofs',
  true,
  5242880, -- 5MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: only authenticated users can upload
CREATE POLICY IF NOT EXISTS "Drivers can upload delivery proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'delivery-proofs');

-- RLS policy: public read access for delivery proofs
CREATE POLICY IF NOT EXISTS "Public read delivery proofs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'delivery-proofs');
