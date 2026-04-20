-- 047: Add extra_items JSONB column to support multiple extra charges per job
-- Each item: { amount: number, reason: string }
ALTER TABLE tecnico_jobs
  ADD COLUMN IF NOT EXISTS extra_items JSONB NOT NULL DEFAULT '[]';
