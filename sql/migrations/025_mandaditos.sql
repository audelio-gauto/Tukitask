-- Migration 025: Mandaditos (errand/shopping orders)
-- Adds order_type, shopping_list and max_budget columns to orders.
-- Existing orders default to order_type = 'envio'.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_type    TEXT   NOT NULL DEFAULT 'envio',
  ADD COLUMN IF NOT EXISTS shopping_list TEXT,
  ADD COLUMN IF NOT EXISTS max_budget    BIGINT;

-- Index for filtering by order type in driver marketplace
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders (order_type);

COMMENT ON COLUMN orders.order_type    IS 'envio | mandadito';
COMMENT ON COLUMN orders.shopping_list IS 'Free-text list of items to buy (mandadito only)';
COMMENT ON COLUMN orders.max_budget    IS 'Maximum amount the client authorises for the purchase, in Gs (mandadito only)';
