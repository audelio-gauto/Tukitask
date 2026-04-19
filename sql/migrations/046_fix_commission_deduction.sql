-- 046: Fix commission deduction — type 'commission_charge' violates CHECK constraint
--
-- BUG: Migration 023 created deduct_tecnico_commission() using type='commission_charge',
-- but migration 025 added a CHECK constraint on wallet_transactions.type that only
-- allows: 'recharge', 'commission', 'adjustment', 'access_fee'.
-- Result: the RPC silently fails → no commission is ever deducted.
--
-- FIX: Recreate the function using type='commission' (the allowed value).
-- Also add 'commission_charge' to the CHECK constraint for any legacy rows.

-- 1. Widen the CHECK to include legacy 'commission_charge' rows
ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
    CHECK (type IN ('recharge', 'commission', 'commission_charge', 'adjustment', 'access_fee'));

-- 2. Recreate deduct_tecnico_commission with the correct type
CREATE OR REPLACE FUNCTION deduct_tecnico_commission(
  p_job_id  UUID,
  p_email   TEXT,
  p_amount  NUMERIC
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  -- Ensure wallet row exists
  INSERT INTO driver_wallets (driver_email, balance, updated_at)
  VALUES (p_email, 0, now())
  ON CONFLICT (driver_email) DO NOTHING;

  -- Deduct atomically
  UPDATE driver_wallets
  SET balance    = balance - p_amount,
      updated_at = now()
  WHERE driver_email = p_email;

  -- Record the transaction (use 'commission' — matches CHECK constraint)
  INSERT INTO wallet_transactions (driver_email, type, amount, job_id, note, created_at)
  VALUES (p_email, 'commission', -p_amount, p_job_id,
          'Comisión por servicio completado', now());

  -- Return new balance
  SELECT balance INTO v_balance FROM driver_wallets WHERE driver_email = p_email;

  RETURN jsonb_build_object('ok', true, 'balance', v_balance);
END;
$$;
