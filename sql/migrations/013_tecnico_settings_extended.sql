-- Migration: extend tecnico_settings with profile + gender fields

ALTER TABLE tecnico_settings
  ADD COLUMN IF NOT EXISTS gender          text,
  ADD COLUMN IF NOT EXISTS first_name      text,
  ADD COLUMN IF NOT EXISTS last_name       text,
  ADD COLUMN IF NOT EXISTS phone           text,
  ADD COLUMN IF NOT EXISTS company         text,
  ADD COLUMN IF NOT EXISTS address         text,
  ADD COLUMN IF NOT EXISTS city            text,
  ADD COLUMN IF NOT EXISTS profile_photo   text,
  ADD COLUMN IF NOT EXISTS theme_mode      text DEFAULT 'light',
  ADD COLUMN IF NOT EXISTS nav_app         text DEFAULT 'google_maps',
  ADD COLUMN IF NOT EXISTS transport_mode  text DEFAULT 'moto',
  ADD COLUMN IF NOT EXISTS vehicle_type    text,
  ADD COLUMN IF NOT EXISTS license_plate   text,
  ADD COLUMN IF NOT EXISTS pickup_range    numeric,
  ADD COLUMN IF NOT EXISTS accepts_packages boolean DEFAULT false;
