-- Migration 030: Add service_filters, pickup_range, delivery_range to driver_profiles
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS pickup_range   INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS delivery_range INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS service_filters JSONB DEFAULT '{"moto_envios":true,"auto_envios":true,"moto_carro_fletes":true,"camion_fletes":true}'::jsonb;
