-- 045: Add promo_code and promo_discount columns to tecnico_jobs
-- Mirrors the same fields already present on the orders table (migration 024).

ALTER TABLE public.tecnico_jobs
  ADD COLUMN IF NOT EXISTS promo_code     TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS promo_discount INTEGER DEFAULT 0;
