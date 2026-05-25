-- 082_bot_custom_messages.sql
-- Add customizable buyer-facing timeout messages per vendor.

alter table vendor_bot_config
  add column if not exists msg_auto_counter    text not null default 'el precio sube de vuelta',
  add column if not exists msg_auto_accept     text not null default 'el precio vuelve al normal',
  add column if not exists msg_pressure_client text not null default 'el precio sube de vuelta';
