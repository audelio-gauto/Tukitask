-- Migration 052: Add warranty_days to tecnico_jobs
-- Allows the tecnico to set a warranty period (in days) when marking a job as completed.

ALTER TABLE public.tecnico_jobs
  ADD COLUMN IF NOT EXISTS warranty_days INT;
