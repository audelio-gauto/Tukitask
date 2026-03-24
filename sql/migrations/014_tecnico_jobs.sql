-- ============================================================
-- 014 (v2): tecnico_jobs — Sistema de servicios estilo inDrive
-- Negociación en tiempo real, estados detallados, intentos de
-- cierre, incidentes y popup con perfil del cliente.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- TABLA PRINCIPAL: tecnico_jobs
--
-- Flujo de estados:
--   pending
--     └─► (técnicos envían ofertas en tecnico_job_offers)
--   accepted         ← cliente acepta oferta de un técnico
--     └─► en_camino  ← técnico confirma que sale
--       └─► llegue   ← técnico confirma llegada
--         └─► en_proceso ← comienza el servicio
--           └─► completion_pending ← técnico marca "completado"
--                 ├─► completado        ← cliente acepta (fin)
--                 └─► rechazado         ← cliente rechaza (vuelve a en_proceso)
--                       └─► [hasta 3 intentos, luego:]
--                             incidente ← 3er rechazo
--   cancelled  ← cancelado por cliente (solo antes de accepted) o por técnico
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tecnico_jobs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- ── Estado ──────────────────────────────────────────────────
  status                text        NOT NULL DEFAULT 'pending',
  -- Valores: pending | accepted | en_camino | llegue | en_proceso
  --          completion_pending | completado | rechazado | cancelled | incidente

  -- ── Cliente ─────────────────────────────────────────────────
  client_email          text        NOT NULL,
  client_name           text,
  client_photo          text,
  client_rating         numeric(3,2),           -- snapshot al crear

  -- ── Técnico asignado (null hasta que cliente acepta una oferta) ──
  tecnico_email         text,
  tecnico_name          text,
  tecnico_photo         text,

  -- ── Timestamps del ciclo de vida ────────────────────────────
  accepted_at           timestamptz,
  en_camino_at          timestamptz,
  llegue_at             timestamptz,
  en_proceso_at         timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  incident_at           timestamptz,

  -- ── Detalles del servicio ────────────────────────────────────
  service_type          text        NOT NULL,
  -- Valores: limpieza | niera | cocina | eventos | cuidado_mascotas |
  --          cuidado_adultos | aire_split | electrico | plomeria | cerrajeria | otros
  service_gender        text        NOT NULL DEFAULT 'indiferente',
  -- Valores: mujer | hombre | indiferente
  description           text,
  address               text,
  lat                   numeric,
  lng                   numeric,
  scheduled_at          timestamptz,

  -- ── Precios y negociación ────────────────────────────────────
  client_initial_price  numeric,      -- precio inicial del cliente
  agreed_price          numeric,      -- precio definitivo (oferta aceptada)
  extra_charge          numeric       NOT NULL DEFAULT 0,  -- cargo extra del técnico durante servicio
  extra_reason          text,         -- motivo del cargo extra
  payment_method        text          NOT NULL DEFAULT 'efectivo',

  -- ── Control de cierre (intentos completado) ─────────────────
  completion_attempts   int           NOT NULL DEFAULT 0,  -- 0 → 3
  last_rejection_reason text,         -- último motivo de rechazo del cliente

  -- ── Calificaciones ──────────────────────────────────────────
  client_rating_given   numeric(3,2),
  tecnico_rating_given  numeric(3,2),

  -- ── Misc ────────────────────────────────────────────────────
  cancel_reason         text
);

-- ─── Columna calculada (total = acordado + extra) ──────────────
-- PostgreSQL 12+ soporta columnas generadas
ALTER TABLE public.tecnico_jobs
  ADD COLUMN IF NOT EXISTS total_price numeric
  GENERATED ALWAYS AS (
    COALESCE(agreed_price, 0) + COALESCE(extra_charge, 0)
  ) STORED;

-- ──────────────────────────────────────────────────────────────
-- TABLA DE OFERTAS: tecnico_job_offers
--
-- Cada técnico puede enviar UNA oferta por trabajo (puede actualizar).
-- El cliente ve todas las ofertas y elige la que prefiera.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tecnico_job_offers (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  job_id            uuid        NOT NULL
    REFERENCES public.tecnico_jobs(id) ON DELETE CASCADE,

  -- Técnico que hace la oferta
  tecnico_email     text        NOT NULL,
  tecnico_name      text,
  tecnico_photo     text,
  tecnico_rating    numeric(3,2),
  distance_km       numeric,              -- distancia aprox. al cliente

  -- Precio propuesto
  proposed_price    numeric     NOT NULL,
  note              text,                 -- mensaje opcional del técnico

  -- Estado de esta oferta
  status            text        NOT NULL DEFAULT 'pending',
  -- Valores: pending | accepted | rejected | expired

  responded_at      timestamptz,

  -- Constraint: un técnico, una oferta activa por trabajo
  UNIQUE (job_id, tecnico_email)
);

-- ──────────────────────────────────────────────────────────────
-- ÍNDICES
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tj_status          ON public.tecnico_jobs (status);
CREATE INDEX IF NOT EXISTS idx_tj_tecnico_email   ON public.tecnico_jobs (tecnico_email);
CREATE INDEX IF NOT EXISTS idx_tj_client_email    ON public.tecnico_jobs (client_email);
CREATE INDEX IF NOT EXISTS idx_tj_service_type    ON public.tecnico_jobs (service_type);
CREATE INDEX IF NOT EXISTS idx_tj_service_gender  ON public.tecnico_jobs (service_gender);
CREATE INDEX IF NOT EXISTS idx_tj_created_at      ON public.tecnico_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tjo_job_id         ON public.tecnico_job_offers (job_id);
CREATE INDEX IF NOT EXISTS idx_tjo_tecnico_email  ON public.tecnico_job_offers (tecnico_email);
CREATE INDEX IF NOT EXISTS idx_tjo_status         ON public.tecnico_job_offers (status);

-- ──────────────────────────────────────────────────────────────
-- FUNCIÓN: actualizar updated_at automáticamente
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_tj_updated_at
  BEFORE UPDATE ON public.tecnico_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_tjo_updated_at
  BEFORE UPDATE ON public.tecnico_job_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Las API routes usan SUPABASE_SERVICE_ROLE_KEY y omiten RLS.
-- Las políticas aplican solo al cliente browser (anon/auth key).
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.tecnico_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tecnico_job_offers ENABLE ROW LEVEL SECURITY;

-- tecnico_jobs: clientes ven/gestionan los suyos
CREATE POLICY "tj_client_own"
  ON public.tecnico_jobs FOR ALL
  USING (client_email = auth.email());

-- tecnico_jobs: técnicos ven pending + los asignados a ellos
CREATE POLICY "tj_tecnico_read"
  ON public.tecnico_jobs FOR SELECT
  USING (
    status = 'pending'
    OR tecnico_email = auth.email()
  );

-- tecnico_jobs: técnicos pueden actualizar pending o los suyos
CREATE POLICY "tj_tecnico_update"
  ON public.tecnico_jobs FOR UPDATE
  USING (
    status = 'pending'
    OR tecnico_email = auth.email()
  );

-- tecnico_job_offers: técnico gestiona sus propias ofertas
CREATE POLICY "tjo_tecnico_own"
  ON public.tecnico_job_offers FOR ALL
  USING (tecnico_email = auth.email());

-- tecnico_job_offers: cliente ve todas las ofertas de sus jobs
CREATE POLICY "tjo_client_read"
  ON public.tecnico_job_offers FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM public.tecnico_jobs
      WHERE client_email = auth.email()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- REALTIME (opcional - habilitar en Supabase Dashboard también)
-- ──────────────────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.tecnico_jobs;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.tecnico_job_offers;

