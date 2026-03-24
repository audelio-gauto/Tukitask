-- ============================================================
-- 015: Add photos column to tecnico_jobs
-- Stores array of photo URLs uploaded by the client in the service form
-- ============================================================

ALTER TABLE public.tecnico_jobs
  ADD COLUMN IF NOT EXISTS photos text[] DEFAULT NULL;

COMMENT ON COLUMN public.tecnico_jobs.photos IS 'Array of photo URLs uploaded by the client when creating the job';
