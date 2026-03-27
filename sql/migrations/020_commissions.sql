-- =============================================
-- 020: Comisiones por vehículo + por conductor + suscripción
-- =============================================

-- 1. Agregar commission_pct y commission_fixed a vehicle_pricing
ALTER TABLE vehicle_pricing
  ADD COLUMN IF NOT EXISTS commission_pct   NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS commission_fixed NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 2. Agregar comisión personalizada + suscripción a driver_profiles
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS custom_commission_pct    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS custom_commission_fixed  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS subscription_active      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_plan        TEXT,
  ADD COLUMN IF NOT EXISTS subscription_expires_at  TIMESTAMPTZ;

-- 3. Actualizar deduct_commission para usar lógica de suscripción
--    Prioridad: suscripción activa → comisión personalizada del driver
--               sin suscripción / vencida → comisión del tipo de vehículo
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
  -- Bloquear fila para evitar doble cobro
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

  -- Obtener comisión del tipo de vehículo (defaults globales)
  SELECT commission_pct, commission_fixed
    INTO v_vehicle
    FROM vehicle_pricing
   WHERE vehicle_type = v_order.vehicle_type
   LIMIT 1;

  -- Obtener datos de suscripción y comisión personalizada del driver
  SELECT custom_commission_pct, custom_commission_fixed,
         subscription_active, subscription_expires_at
    INTO v_driver
    FROM driver_profiles
   WHERE email = v_order.accepted_by
   LIMIT 1;

  -- Decidir qué comisión aplicar
  IF v_driver.subscription_active = true
     AND v_driver.subscription_expires_at IS NOT NULL
     AND v_driver.subscription_expires_at > now() THEN
    -- Suscripción vigente: usar comisión personalizada del driver
    v_pct   := COALESCE(v_driver.custom_commission_pct, 0);
    v_fixed := COALESCE(v_driver.custom_commission_fixed, 0);
    v_note  := 'Comisión suscripción';
  ELSE
    -- Sin suscripción o vencida: usar comisión global del vehículo
    -- Auto-desactivar si estaba activa pero venció
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

  -- Crear billetera si no existe
  INSERT INTO driver_wallets (driver_email, balance)
    VALUES (v_order.accepted_by, 0.00)
    ON CONFLICT (driver_email) DO NOTHING;

  -- Descontar comisión
  UPDATE driver_wallets
     SET balance    = balance - v_commission,
         updated_at = now()
   WHERE driver_email = v_order.accepted_by;

  -- Registrar transacción
  INSERT INTO wallet_transactions (driver_email, type, amount, order_id, note)
    VALUES (
      v_order.accepted_by,
      'commission',
      -v_commission,
      p_order_id,
      v_note || ': Gs ' || v_fixed::TEXT || ' fijo + ' || v_pct::TEXT
        || '% sobre Gs ' || COALESCE(v_order.offer, 0)::TEXT
    );

  -- Marcar orden como comisión cobrada
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
