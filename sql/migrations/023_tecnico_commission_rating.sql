--- 023: Tecnico commission deduction function + rating columns
-- Allows atomic wallet deduction when a tecnico job is completed,
-- and stores the client's rating for the tecnico on each job.

-- ── Rating columns on tecnico_jobs ──────────────────────────────────────────
ALTER TABLE tecnico_jobs
  ADD COLUMN IF NOT EXISTS tecnico_rating      SMALLINT CHECK (tecnico_rating >= 1 AND tecnico_rating <= 5),
  ADD COLUMN IF NOT EXISTS tecnico_rating_note TEXT;

-- ── avg_rating / total_ratings on tecnico_settings (if not yet present) ──────
ALTER TABLE tecnico_settings
  ADD COLUMN IF NOT EXISTS avg_rating    NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS total_ratings INT DEFAULT 0;

-- ── Atomic commission deduction function ────────────────────────────────────
-- Called from the API after accept_completion transitions the job to 'completado'.
-- Upserts the wallet row, decrements balance, and inserts a wallet_transaction.

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

  -- Record the transaction
  INSERT INTO wallet_transactions (driver_email, type, amount, job_id, note, created_at)
  VALUES (p_email, 'commission_charge', -p_amount, p_job_id,
          'Comisión por servicio completado', now());

  -- Return new balance
  SELECT balance INTO v_balance FROM driver_wallets WHERE driver_email = p_email;

  RETURN jsonb_build_object('ok', true, 'balance', v_balance);
END;
$$;
