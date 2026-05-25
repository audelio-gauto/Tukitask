-- 080_vendor_bot_config.sql
-- Stores TukiBot configuration per vendor in the database.
-- Replaces localStorage-only approach that only worked on the same browser.

create table if not exists vendor_bot_config (
  vendor_id        text primary key,
  bot_enabled      boolean  not null default true,
  bot_tone         text     not null default 'amigable'
                   check (bot_tone in ('informal','formal','agresivo','amigable')),
  timeout_minutes  int      not null default 15
                   check (timeout_minutes in (1,5,10,15,30,60)),
  timeout_action   text     not null default 'auto_counter'
                   check (timeout_action in ('auto_counter','auto_accept','pressure_client')),
  auto_accept_above int     not null default 90
                   check (auto_accept_above between 50 and 100),
  updated_at       timestamptz not null default now()
);

alter table vendor_bot_config enable row level security;

-- Vendors can read and write their own config
create policy "vendor_bot_config_own"
  on vendor_bot_config for all
  using  (vendor_id = auth.uid()::text)
  with check (vendor_id = auth.uid()::text);
