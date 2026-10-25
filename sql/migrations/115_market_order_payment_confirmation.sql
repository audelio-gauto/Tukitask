-- Track bank-transfer confirmation separately from the fulfillment status.
ALTER TABLE public.market_orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by TEXT;

UPDATE public.market_orders
SET payment_status = 'awaiting_confirmation'
WHERE payment_method = 'transferencia'
  AND payment_status = 'not_required';

DO $$
BEGIN
  ALTER TABLE public.market_orders
    ADD CONSTRAINT market_orders_payment_status_check
    CHECK (payment_status IN ('not_required', 'awaiting_confirmation', 'confirmed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_market_orders_payment_confirmation
  ON public.market_orders (vendor_email, created_at DESC)
  WHERE payment_status = 'awaiting_confirmation';