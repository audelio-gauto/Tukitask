-- 082_bot_custom_messages.sql
-- Add customizable buyer-facing timeout messages per vendor.

alter table vendor_bot_config
  add column if not exists msg_auto_counter    text not null default '🔥 Oferta exclusiva hasta las {hora}. Aprovechá este precio especial antes de que vuelva a subir.',
  add column if not exists msg_auto_accept     text not null default 'Tu oferta fue aprobada por tiempo limitado hasta las {hora}. Confirmá ahora y asegurá este precio antes de que regrese al valor normal.',
  add column if not exists msg_pressure_client text not null default '⚡ Última oportunidad hasta las {hora}. Aprovechá el descuento antes de que el precio vuelva a aumentar.';
