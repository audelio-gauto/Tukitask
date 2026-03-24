-- ============================================================
-- 014: tecnico_jobs — Service request marketplace for técnicos
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tecnico_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Status lifecycle:
  -- pending → accepted → in_progress → completed
  --                    ↘ cancelled / rejected
  status          text NOT NULL DEFAULT 'pending',

  -- Client info
  client_email    text NOT NULL,
  client_name     text,
  client_photo    text,

  -- Assigned tecnico (null until accepted)
  tecnico_email   text,
  accepted_at     timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz,

  -- Service details
  service_type    text NOT NULL,           -- key: 'limpieza', 'plomeria', etc.
  service_gender  text NOT NULL DEFAULT 'indiferente', -- 'mujer' | 'hombre' | 'indiferente'
  description     text,
  address         text,
  lat             numeric,
  lng             numeric,

  -- Appointment
  scheduled_at    timestamptz,

  -- Pricing
  price           numeric,
  payment_method  text DEFAULT 'efectivo',

  -- Misc
  note            text
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_status         ON public.tecnico_jobs (status);
CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_tecnico_email  ON public.tecnico_jobs (tecnico_email);
CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_client_email   ON public.tecnico_jobs (client_email);
CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_service_type   ON public.tecnico_jobs (service_type);
CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_service_gender ON public.tecnico_jobs (service_gender);

-- Enable Row Level Security
ALTER TABLE public.tecnico_jobs ENABLE ROW LEVEL SECURITY;

-- Allow clients to insert their own jobs + read their own
CREATE POLICY "client_manage_own_jobs" ON public.tecnico_jobs
  FOR ALL USING (client_email = auth.email());

-- Allow técnicos to read pending jobs and their own accepted jobs
CREATE POLICY "tecnico_read_jobs" ON public.tecnico_jobs
  FOR SELECT USING (
    status = 'pending'
    OR tecnico_email = auth.email()
  );

-- Allow técnicos to update (accept/complete) jobs assigned to them or unassigned pending
CREATE POLICY "tecnico_update_jobs" ON public.tecnico_jobs
  FOR UPDATE USING (
    status = 'pending'
    OR tecnico_email = auth.email()
  );

-- Service role bypasses RLS (used by server-side API routes)
