--- =============================================
-- 021: Comisiones + suscripción para técnicos (tecnico_settings)
-- =============================================

-- 0. Asegurar que 'tecnico' existe en el enum user_role (por si no estaba)
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'tecnico';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1. Agregar comisión personalizada + suscripción a tecnico_settings
ALTER TABLE tecnico_settings
  ADD COLUMN IF NOT EXISTS custom_commission_pct    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS custom_commission_fixed  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS subscription_active      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_plan        TEXT,
  ADD COLUMN IF NOT EXISTS subscription_expires_at  TIMESTAMPTZ;

-- 2. Crear tabla de precios sugeridos por tipo de servicio
CREATE TABLE IF NOT EXISTS service_pricing (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type  TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  emoji         TEXT NOT NULL DEFAULT '',
  suggested_price    NUMERIC(10,2),   -- precio sugerido al cliente
  commission_pct     NUMERIC(5,2)  NOT NULL DEFAULT 12.00,
  commission_fixed   NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order    INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Insertar tipos de servicio base
INSERT INTO service_pricing (service_type, label, emoji, suggested_price, commission_pct, commission_fixed, sort_order)
VALUES
  ('limpieza',         'Limpieza del Hogar',    '🧹', NULL, 12.00, 0, 1),
  ('niera',            'Niñera / Cuidado Niños','👶', NULL, 12.00, 0, 2),
  ('cocina',           'Cocinero/a',            '🍳', NULL, 12.00, 0, 3),
  ('eventos',          'Eventos / Catering',    '🎉', NULL, 12.00, 0, 4),
  ('cuidado_mascotas', 'Cuidado de Mascotas',   '🐾', NULL, 12.00, 0, 5),
  ('cuidado_adultos',  'Cuidado de Adultos',    '🧓', NULL, 12.00, 0, 6),
  ('aire_split',       'Aire / Split',          '❄️', NULL, 12.00, 0, 7),
  ('electrico',        'Electricidad',          '⚡', NULL, 12.00, 0, 8),
  ('plomeria',         'Plomería',              '🔧', NULL, 12.00, 0, 9),
  ('cerrajeria',       'Cerrajería',            '🔑', NULL, 12.00, 0, 10),
  ('otros',            'Otros Servicios',       '🛠️', NULL, 12.00, 0, 11)
ON CONFLICT (service_type) DO NOTHING;

-- 4. Actualizar deduct_commission_job para usar lógica de suscripción
DROP FUNCTION IF EXISTS deduct_commission_job(uuid);
CREATE OR REPLACE FUNCTION deduct_commission_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job        RECORD;
  v_service    RECORD;
  v_tecnico    RECORD;
  v_pct        NUMERIC;
  v_fixed      NUMERIC;
  v_commission NUMERIC;
  v_note       TEXT;
BEGIN
  SELECT id, status, tecnico_email, agreed_price, service_type
    INTO v_job
    FROM tecnico_jobs
   WHERE id = p_job_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_found');
  END IF;

  IF v_job.status = 'commission_charged' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_charged');
  END IF;

  -- Obtener comisión del tipo de servicio
  SELECT commission_pct, commission_fixed
    INTO v_service
    FROM service_pricing
   WHERE service_type = v_job.service_type
   LIMIT 1;

  -- Obtener suscripción y comisión personalizada del técnico
  SELECT custom_commission_pct, custom_commission_fixed,
         subscription_active, subscription_expires_at
    INTO v_tecnico
    FROM tecnico_settings
   WHERE email = v_job.tecnico_email
   LIMIT 1;

  -- Decidir qué comisión aplicar
  IF v_tecnico.subscription_active = true
     AND v_tecnico.subscription_expires_at IS NOT NULL
     AND v_tecnico.subscription_expires_at > now() THEN
    v_pct   := COALESCE(v_tecnico.custom_commission_pct, 0);
    v_fixed := COALESCE(v_tecnico.custom_commission_fixed, 0);
    v_note  := 'Comisión suscripción';
  ELSE
    IF v_tecnico.subscription_active = true
       AND v_tecnico.subscription_expires_at IS NOT NULL
       AND v_tecnico.subscription_expires_at <= now() THEN
      UPDATE tecnico_settings
         SET subscription_active = false
       WHERE email = v_job.tecnico_email;
    END IF;
    -- Fallback: tecnico_settings.commission_pct → service_pricing → 12%
    SELECT COALESCE(ts.commission_pct, COALESCE(v_service.commission_pct, 12.00)) INTO v_pct
      FROM tecnico_settings ts
     WHERE ts.email = v_job.tecnico_email
     LIMIT 1;
    v_fixed := COALESCE(v_service.commission_fixed, 0);
    v_note  := 'Comisión global';
  END IF;

  v_commission := ROUND(
    v_fixed + (COALESCE(v_job.agreed_price, 0) * v_pct / 100),
    2
  );

  INSERT INTO driver_wallets (driver_email, balance)
    VALUES (v_job.tecnico_email, 0.00)
    ON CONFLICT (driver_email) DO NOTHING;

  UPDATE driver_wallets
     SET balance    = balance - v_commission,
         updated_at = now()
   WHERE driver_email = v_job.tecnico_email;

  INSERT INTO wallet_transactions (driver_email, type, amount, order_id, note)
    VALUES (
      v_job.tecnico_email,
      'commission',
      -v_commission,
      p_job_id,
      v_note || ': Gs ' || v_fixed::TEXT || ' fijo + ' || v_pct::TEXT
        || '% sobre Gs ' || COALESCE(v_job.agreed_price, 0)::TEXT
    );

  UPDATE tecnico_jobs
     SET status = 'commission_charged'
   WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'commission', v_commission,
    'pct',        v_pct,
    'fixed',      v_fixed,
    'tecnico',    v_job.tecnico_email
  );
END;
$$;
