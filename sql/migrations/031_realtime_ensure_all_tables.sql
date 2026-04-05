-- ============================================================
-- 031: Garantizar que TODAS las tablas críticas estén en
--      supabase_realtime publication para notificaciones
--      instantáneas en Driver y Técnico.
--
-- PROBLEMA que resuelve:
--   tecnico_jobs y tecnico_job_offers estaban comentadas en
--   migración 014, por lo que el Realtime no disparaba eventos
--   y el sistema caía al polling de 60s → demoras de 50+s.
--
-- SEGURO para re-ejecutar: usa DO $$ ... EXCEPTION cuando
--   la tabla ya está en la publicación (duplicate_object).
-- ============================================================

DO $$
BEGIN
  -- orders (8_enable_realtime ya lo agregó, pero por si acaso)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- driver_offers: clientes ven ofertas de conductores en tiempo real
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_offers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- tecnico_jobs: técnicos ven trabajos nuevos al instante
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tecnico_jobs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- tecnico_job_offers: clientes ven ofertas de técnicos en tiempo real
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tecnico_job_offers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- driver_locations: tracking GPS en tiempo real
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- notifications: push tokens y alertas
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- billetera: conductores ven cambios de saldo al instante
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_wallets;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

END $$;

-- Verificar qué tablas quedaron en la publicación
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
