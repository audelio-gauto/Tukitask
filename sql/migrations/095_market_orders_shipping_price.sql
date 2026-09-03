-- 095_market_orders_shipping_price.sql
-- Guarda el costo de envío aplicado a cada pedido del marketplace, calculado
-- en el servidor según la configuración de cobertura por ciudad del vendedor
-- (store_configs.config.deliveryCities). El total del pedido pasa a incluir
-- este monto (subtotal de productos + envío), igual que en WooCommerce.

ALTER TABLE market_orders
  ADD COLUMN IF NOT EXISTS shipping_price numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN market_orders.shipping_price IS
  'Costo de envío aplicado al pedido según la ciudad de entrega y la configuración del vendedor (0 = envío gratis o sin configurar).';
