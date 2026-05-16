-- Migration 065: Precio acordado antes de editar (tecnico can adjust price while working)
-- Stores the original agreed_price before the tecnico edits it in en_proceso state

ALTER TABLE public.tecnico_jobs
  ADD COLUMN IF NOT EXISTS agreed_price_before NUMERIC;

COMMENT ON COLUMN public.tecnico_jobs.agreed_price_before
  IS 'Precio acordado original antes de la última edición por el técnico durante en_proceso';
