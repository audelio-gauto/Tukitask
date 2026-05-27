-- 093_market_orders_payment_method.sql
-- Add explicit payment method to marketplace orders.
-- Default is contra_entrega so the checkout can persist the selected method.

alter table market_orders
  add column if not exists payment_method text not null default 'contra_entrega';

comment on column market_orders.payment_method is 'Payment method selected by the client for the order';
