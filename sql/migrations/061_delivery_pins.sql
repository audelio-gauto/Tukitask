-- 061_delivery_pins.sql
-- Anti-fraud dual-PIN system for delivery orders (order_type = 'envio' only)
--
-- pickup_code  → generated at order creation, shown to the SENDER
--               driver must enter this code when picking up (at_pickup → in_transit)
--
-- delivery_pin → generated at order creation, shown to the SENDER
--               sender shares it with the recipient via WhatsApp / call / etc.
--               driver must enter this code to mark the order as delivered
--
-- delivery_flagged → set to TRUE when PIN override was used after 5 failed attempts
--                    admin can review these orders
--
-- For multi-stop envio: each order_stop gets its own delivery_pin
--   orders.pickup_code    → one per order (for pickup)
--   order_stops.delivery_pin → one per stop (for delivery at each destination)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_code      char(4),
  ADD COLUMN IF NOT EXISTS delivery_pin     char(4),
  ADD COLUMN IF NOT EXISTS delivery_flagged boolean NOT NULL DEFAULT false;

-- Per-stop delivery PINs for multi-stop envio orders
ALTER TABLE order_stops
  ADD COLUMN IF NOT EXISTS delivery_pin char(4);

-- Index for admin queries on flagged orders
CREATE INDEX IF NOT EXISTS idx_orders_delivery_flagged
  ON orders (delivery_flagged)
  WHERE delivery_flagged = true;
