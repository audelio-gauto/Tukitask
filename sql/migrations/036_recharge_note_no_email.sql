-- Migration 036: Remove admin email from recharge approval note
-- Before: "Recarga aprobada por admin@gmail.com"
-- After:  "Recarga aprobada"
-- The admin email is already stored in recharge_requests.reviewed_by — no need to expose it in the note.

CREATE OR REPLACE FUNCTION approve_recharge(p_request_id UUID, p_admin_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req    RECORD;
  v_result JSONB;
BEGIN
  SELECT id, driver_email, amount, status
    INTO v_req
    FROM recharge_requests
   WHERE id = p_request_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  -- Credit the wallet
  INSERT INTO driver_wallets (driver_email, balance, updated_at)
    VALUES (v_req.driver_email, v_req.amount, now())
    ON CONFLICT (driver_email)
    DO UPDATE SET balance    = driver_wallets.balance + EXCLUDED.balance,
                  updated_at = now();

  -- Record transaction — no admin email in the note
  INSERT INTO wallet_transactions (driver_email, type, amount, note, created_at)
    VALUES (v_req.driver_email, 'recharge', v_req.amount, 'Recarga aprobada', now());

  -- Mark request approved
  UPDATE recharge_requests
     SET status      = 'approved',
         reviewed_by = p_admin_email,
         reviewed_at = now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'ok',     true,
    'amount', v_req.amount,
    'driver', v_req.driver_email
  );
END;
$$;
