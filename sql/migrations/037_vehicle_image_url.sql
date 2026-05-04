-- Migration 037: Add image_url column to vehicle_pricing
-- Allows admins to upload a custom icon/photo (round, 300×300 px) per vehicle type
-- shown in the client order form (step 2 – vehicle selection).

ALTER TABLE public.vehicle_pricing
  ADD COLUMN IF NOT EXISTS image_url TEXT;
