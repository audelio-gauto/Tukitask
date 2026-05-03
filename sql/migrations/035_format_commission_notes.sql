-- Migration 035: Format commission note amounts with thousand separators (period)
-- Before: "Comisión suscripción: Gs 2500.00 fijo + 0% sobre Gs 27047.00"
-- After:  "Comisión suscripción: Gs 2.500 fijo + 0% sobre Gs 27.047"
--
-- Uses replace(to_char(n, 'FM999,999,999'), ',', '.') to get Paraguayan style.

-- Helper macro (inline — no need for a separate function)
-- We recreate deduct_commission and deduct_commission_job with formatted notes.

-- ── 1. deduct_commission (driver orders) ─────────────────────────────────
CREATE OR REPLACE FUNCTION deduct_commission(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order      RECORD;
  v_vehicle    RECORD;
  v_driver     RECORD;
  v_pct        NUMERIC;
  v_fixed      NUMERIC;
  v_commission NUMERIC;
  v_note       TEXT;
BEGIN
  SELECT id, status, accepted_by, offer, vehicle_type
    INTO v_order
    FROM orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order.status = 'commission_charged' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_charged');
  END IF;

  SELECT commission_pct, commission_fixed
    INTO v_vehicle
    FROM vehicle_pricing
   WHERE vehicle_type = v_order.vehicle_type
   LIMIT 1;

  SELECT custom_commission_pct, custom_commission_fixed,
         subscription_active, subscription_expires_at
    INTO v_driver
    FROM driver_profiles
   WHERE email = v_order.accepted_by
   LIMIT 1;

  IF v_driver.subscription_active = true
     AND v_driver.subscription_expires_at IS NOT NULL
     AND v_driver.subscription_expires_at > now() THEN
    v_pct   := COALESCE(v_driver.custom_commission_pct, 0);
    v_fixed := COALESCE(v_driver.custom_commission_fixed, 0);
    v_note  := 'Comisión suscripción';
  ELSE
    IF v_driver.subscription_active = true
       AND v_driver.subscription_expires_at IS NOT NULL
       AND v_driver.subscription_expires_at <= now() THEN
      UPDATE driver_profiles
         SET subscription_active = false
       WHERE email = v_order.accepted_by;
    END IF;
    v_pct   := COALESCE(v_vehicle.commission_pct, 10.00);
    v_fixed := COALESCE(v_vehicle.commission_fixed, 0);
    v_note  := 'Comisión global';
  END IF;

  v_commission := ROUND(
    v_fixed + (COALESCE(v_order.offer, 0) * v_pct / 100),
    2
  );

  INSERT INTO driver_wallets (driver_email, balance)
    VALUES (v_order.accepted_by, 0.00)
    ON CONFLICT (driver_email) DO NOTHING;

  UPDATE driver_wallets
     SET balance    = balance - v_commission,
         updated_at = now()
   WHERE driver_email = v_order.accepted_by;

  INSERT INTO wallet_transactions (driver_email, type, amount, order_id, note)
    VALUES (
      v_order.accepted_by,
      'commission',
      -v_commission,
      p_order_id,
      v_note || ': Gs '
        || replace(to_char(v_fixed, 'FM999,999,999'), ',', '.')
        || ' fijo + ' || v_pct::TEXT
        || '% sobre Gs '
        || replace(to_char(COALESCE(v_order.offer, 0), 'FM999,999,999'), ',', '.')
    );

  UPDATE orders
     SET status = 'commission_charged'
   WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'commission', v_commission,
    'pct',        v_pct,
    'fixed',      v_fixed,
    'driver',     v_order.accepted_by
  );
END;
$$;

-- ── 2. deduct_commission_job (tecnico jobs — original from 021/025) ────────
CREATE OR REPLACE FUNCTION deduct_commission_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job        RECORD;
  v_tecnico    RECORD;
  v_global     RECORD;
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

  SELECT commission_pct, commission_fixed
    INTO v_global
    FROM service_pricing
   WHERE service_type = v_job.service_type
   LIMIT 1;

  SELECT custom_commission_pct, custom_commission_fixed,
         subscription_active, subscription_expires_at
    INTO v_tecnico
    FROM tecnico_settings
   WHERE tecnico_email = v_job.tecnico_email
   LIMIT 1;

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
       WHERE tecnico_email = v_job.tecnico_email;
    END IF;
    v_pct   := COALESCE(v_global.commission_pct, 12.00);
    v_fixed := COALESCE(v_global.commission_fixed, 0);
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

  INSERT INTO wallet_transactions (driver_email, type, amount, job_id, note)
    VALUES (
      v_job.tecnico_email,
      'commission',
      -v_commission,
      p_job_id,
      v_note || ': Gs '
        || replace(to_char(v_fixed, 'FM999,999,999'), ',', '.')
        || ' fijo + ' || v_pct::TEXT
        || '% sobre Gs '
        || replace(to_char(COALESCE(v_job.agreed_price, 0), 'FM999,999,999'), ',', '.')
    );

  UPDATE tecnico_jobs
     SET status = 'commission_charged'
   WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'commission', v_commission,
    'pct',        v_pct,
    'fixed',      v_fixed,
    'driver',     v_job.tecnico_email
  );
END;
$$;
