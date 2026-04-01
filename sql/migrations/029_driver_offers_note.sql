-- Add optional message/note from driver to client on each offer
ALTER TABLE public.driver_offers
  ADD COLUMN IF NOT EXISTS note TEXT;
