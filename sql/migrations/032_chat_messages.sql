-- ============================================================
-- 032: Sistema de Chat en tiempo real
--   - chat_messages: mensajes entre cliente y driver/técnico
--   - Scoped por order_id o job_id
--   - RLS: solo los participantes pueden leer/escribir
--   - Realtime habilitado para entrega instantánea
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Scope: uno de los dos debe estar presente
  order_id     UUID         REFERENCES public.orders(id)       ON DELETE CASCADE,
  job_id       UUID         REFERENCES public.tecnico_jobs(id) ON DELETE CASCADE,
  -- Quién escribe
  sender_email TEXT         NOT NULL,
  sender_name  TEXT,
  sender_role  TEXT         NOT NULL CHECK (sender_role IN ('client','driver','tecnico')),
  -- Contenido
  content      TEXT         NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  -- Lectura
  read_at      TIMESTAMPTZ  DEFAULT NULL
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_chat_order  ON public.chat_messages (order_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_job    ON public.chat_messages (job_id,   created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_sender ON public.chat_messages (sender_email);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Service role (API routes) tiene acceso total
DROP POLICY IF EXISTS "chat_service_role" ON public.chat_messages;
CREATE POLICY "chat_service_role"
  ON public.chat_messages FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Participantes de un envío (cliente + driver asignado) pueden leer y escribir
DROP POLICY IF EXISTS "chat_order_participants" ON public.chat_messages;
CREATE POLICY "chat_order_participants"
  ON public.chat_messages FOR ALL
  TO authenticated
  USING (
    order_id IS NOT NULL AND (
      -- Es el cliente del pedido
      EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = chat_messages.order_id
          AND o.client_email = auth.email()
      )
      OR
      -- Es el driver asignado
      EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = chat_messages.order_id
          AND o.accepted_by = auth.email()
      )
    )
  )
  WITH CHECK (
    order_id IS NOT NULL AND sender_email = auth.email()
    AND (
      EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = chat_messages.order_id
          AND (o.client_email = auth.email() OR o.accepted_by = auth.email())
      )
    )
  );

-- Participantes de un trabajo técnico (cliente + técnico asignado) pueden leer y escribir
DROP POLICY IF EXISTS "chat_job_participants" ON public.chat_messages;
CREATE POLICY "chat_job_participants"
  ON public.chat_messages FOR ALL
  TO authenticated
  USING (
    job_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.tecnico_jobs j
        WHERE j.id = chat_messages.job_id
          AND (j.client_email = auth.email() OR j.tecnico_email = auth.email())
      )
    )
  )
  WITH CHECK (
    job_id IS NOT NULL AND sender_email = auth.email()
    AND (
      EXISTS (
        SELECT 1 FROM public.tecnico_jobs j
        WHERE j.id = chat_messages.job_id
          AND (j.client_email = auth.email() OR j.tecnico_email = auth.email())
      )
    )
  );

-- ── Realtime ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
