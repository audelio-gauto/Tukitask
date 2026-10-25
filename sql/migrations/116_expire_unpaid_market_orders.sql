CREATE INDEX IF NOT EXISTS idx_market_orders_unpaid_transfer_expiry
  ON public.market_orders (created_at)
  WHERE payment_method = 'transferencia'
    AND payment_status = 'awaiting_confirmation'
    AND payment_proof_url IS NULL
    AND status = 'pending';

ALTER TABLE public.tukibot_negotiations
  DROP CONSTRAINT IF EXISTS tukibot_negotiations_status_check;

ALTER TABLE public.tukibot_negotiations
  ADD CONSTRAINT tukibot_negotiations_status_check
  CHECK (status IN (
    'accepted',
    'countered',
    'accepted_pending_payment',
    'pending_payment',
    'paid',
    'timeout_auto_counter',
    'timeout_auto_accept',
    'timeout_pressure'
  ));

CREATE OR REPLACE FUNCTION public.fn_expire_unpaid_market_orders()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_orders INTEGER := 0;
  v_products_restored INTEGER := 0;
BEGIN
  WITH stale_orders AS (
    SELECT id
    FROM public.market_orders
    WHERE payment_method = 'transferencia'
      AND payment_status = 'awaiting_confirmation'
      AND payment_proof_url IS NULL
      AND status = 'pending'
      AND created_at <= now() - INTERVAL '24 hours'
    FOR UPDATE SKIP LOCKED
  ), expired_orders AS (
    UPDATE public.market_orders AS orders
    SET status = 'cancelled',
        cancelled_at = now(),
        updated_at = now()
    FROM stale_orders
    WHERE orders.id = stale_orders.id
    RETURNING orders.id, orders.items
  ), product_quantities AS (
    SELECT
      (item.value->>'productId')::UUID AS product_id,
      SUM((item.value->>'qty')::INTEGER)::INTEGER AS quantity
    FROM expired_orders
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(expired_orders.items, '[]'::JSONB)) AS item(value)
    GROUP BY (item.value->>'productId')::UUID
  ), restored_negotiations AS (
    UPDATE public.tukibot_negotiations AS negotiations
    SET status = 'accepted_pending_payment',
        market_order_id = NULL,
        paid_at = NULL,
        updated_at = now()
    FROM expired_orders
    WHERE negotiations.market_order_id = expired_orders.id
      AND negotiations.status = 'pending_payment'
    RETURNING negotiations.id
  ), restored_products AS (
    UPDATE public.products AS products
    SET stock = COALESCE(products.stock, 0) + product_quantities.quantity
    FROM product_quantities
    WHERE products.id = product_quantities.product_id
    RETURNING products.id
  )
  SELECT
    (SELECT COUNT(*) FROM expired_orders)::INTEGER,
    (SELECT COUNT(*) FROM restored_products)::INTEGER
  INTO v_expired_orders, v_products_restored;

  RETURN jsonb_build_object(
    'expired_orders', v_expired_orders,
    'products_restored', v_products_restored,
    'executed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_expire_unpaid_market_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_expire_unpaid_market_orders() TO service_role;