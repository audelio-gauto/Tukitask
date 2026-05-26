-- 084_tukibot_negotiation_memory.sql
-- Add buyer identity fields to persist negotiation memory per client.

alter table tukibot_negotiations
  add column if not exists buyer_id text,
  add column if not exists buyer_email text;

create index if not exists idx_tukibot_negotiations_buyer_product_created
  on tukibot_negotiations (buyer_id, product_id, created_at desc)
  where buyer_id is not null;
