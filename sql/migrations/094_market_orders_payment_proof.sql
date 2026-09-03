-- Migration 094: Comprobante de pago (transferencia) para pedidos de marketplace
-- Ejecutar en: Supabase Dashboard > SQL Editor

alter table market_orders
  add column if not exists payment_proof_url text;

comment on column market_orders.payment_proof_url is 'URL pública (bucket delivery-proofs) del comprobante de transferencia subido por el cliente en el checkout';
