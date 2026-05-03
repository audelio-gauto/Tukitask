-- Migration 034: Add admin_credit, admin_debit, refund, bonus transaction types
-- The wallet_transactions type CHECK only allowed 'recharge','commission','adjustment','access_fee'.
-- Admin wallet adjustments were failing silently because the insert violated the constraint.

-- Drop existing constraint
ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;

-- Re-add with full set of valid types
ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
    CHECK (type IN ('recharge','commission','adjustment','access_fee','admin_credit','admin_debit','refund','bonus'));
