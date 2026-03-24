-- 016: Agregar campo audio_url a tecnico_jobs
-- Permite al cliente grabar un audio al crear la solicitud
-- que el técnico puede escuchar en la página de ofertas/citas.

ALTER TABLE public.tecnico_jobs
  ADD COLUMN IF NOT EXISTS audio_url text DEFAULT NULL;

COMMENT ON COLUMN public.tecnico_jobs.audio_url IS 'URL del audio grabado por el cliente al crear la solicitud';
