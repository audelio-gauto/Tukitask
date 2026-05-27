-- 094_drop_vendor_bot_timeout_customization.sql
-- Removes deprecated vendor_bot_config fields no longer used by panel/API/runtime.

alter table if exists vendor_bot_config
  drop column if exists timeout_minutes,
  drop column if exists timeout_action,
  drop column if exists msg_auto_counter,
  drop column if exists msg_auto_accept,
  drop column if exists msg_pressure_client;
