-- ============================================================
-- 025: Saldo mínimo obligatorio para recibir solicitudes
-- ============================================================
-- Objetivo: todo driver/técnico debe tener saldo >= DRIVER_MIN_WALLET_BALANCE
-- en su billetera para poder ver y ofertar en solicitudes.
-- La verificación es doble:
--   1. GET /api/orders y GET /api/tecnico/jobs?offers=true  → HTTP 402 si no cumple
--   2. POST /api/orders/offers y POST /api/tecnico/jobs (send_offer) → HTTP 402 si no cumple
-- Esto previene que alguien acumule saldo negativo ilimitado y
-- garantiza la integridad del sistema de comisiones.
--
-- Variable de entorno a configurar en Vercel / .env.local:
--   DRIVER_MIN_WALLET_BALANCE=5000   ← mínimo en Guaraníes (0 = solo bloquea negativo)
-- ============================================================

-- ── 1. Performance: índice sobre balance para lookups frecuentes ─────────
CREATE INDEX IF NOT EXISTS idx_wallet_balance
  ON driver_wallets (balance);

-- ── 2. Ampliar tipos de transacción para acceso a red (uso futuro) ────────
-- La tabla tiene: CHECK (type IN ('recharge','commission','adjustment'))
-- Necesitamos también 'access_fee' para eventual tarifa por matcheo (como InDrive).
-- IMPORTANTE: primero normalizar cualquier fila con type desconocido para que
-- el ADD CONSTRAINT no falle con 23514 (check_violation).
UPDATE wallet_transactions
  SET type = 'adjustment',
      note = COALESCE(note, '') || ' [tipo_desconocido_normalizado]'
  WHERE type NOT IN ('recharge', 'commission', 'adjustment', 'access_fee');

ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
    CHECK (type IN ('recharge','commission','adjustment','access_fee'));

-- ── 3. Corregir bug: deduct_commission_job usaba order_id en lugar de job_id ──
-- La versión en 021_tecnico_commissions.sql insertaba en wallet_transactions
-- con la columna order_id en vez de job_id para referencia al trabajo técnico.
-- Esto se corrige aquí con CREATE OR REPLACE FUNCTION.
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
  -- Bloquear fila para evitar doble cobro en race conditions
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

  -- Decidir qué comisión aplicar: suscripción activa > global > service_pricing > 12%
  IF v_tecnico.subscription_active = true
     AND v_tecnico.subscription_expires_at IS NOT NULL
     AND v_tecnico.subscription_expires_at > now() THEN
    v_pct   := COALESCE(v_tecnico.custom_commission_pct, 0);
    v_fixed := COALESCE(v_tecnico.custom_commission_fixed, 0);
    v_note  := 'Comisión suscripción';
  ELSE
    -- Auto-desactivar suscripción vencida
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

  -- Upsert wallet
  INSERT INTO driver_wallets (driver_email, balance)
    VALUES (v_job.tecnico_email, 0.00)
    ON CONFLICT (driver_email) DO NOTHING;

  -- Descontar del saldo
  UPDATE driver_wallets
     SET balance    = balance - v_commission,
         updated_at = now()
   WHERE driver_email = v_job.tecnico_email;

  -- ✅ FIX: usar columna job_id (no order_id) para trabajos técnicos
  INSERT INTO wallet_transactions (driver_email, type, amount, job_id, note)
    VALUES (
      v_job.tecnico_email,
      'commission',
      -v_commission,
      p_job_id,           -- ← correctamente en job_id
      v_note || ': Gs ' || v_fixed::TEXT || ' fijo + ' || v_pct::TEXT
        || '% sobre Gs ' || COALESCE(v_job.agreed_price, 0)::TEXT
    );

  -- Marcar trabajo como comisión cobrada
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

-- ── 4. Comentario de referencia — configuración recomendada ──────────────
-- Configurar en Vercel → Settings → Environment Variables:
--   DRIVER_MIN_WALLET_BALANCE = 5000
-- Con ese valor:
--   - Un driver/técnico necesita al menos Gs 5.000 para ver y ofertar.
--   - Si su saldo baja de Gs 5.000 (ej. por comisiones), el sistema
--     bloquea nuevas ofertas hasta que recargue.
--   - Con valor 0 (default): solo bloquea saldo negativo.
