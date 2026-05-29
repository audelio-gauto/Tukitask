-- 096_tukibot_active_negotiations.sql
-- Negotiations that remain active for vendor/client after the bot responds.

alter table if exists tukibot_negotiations
  add column if not exists vendor_email text,
  add column if not exists buyer_name text,
  add column if not exists product_image text,
  add column if not exists quantity integer not null default 1,
  add column if not exists bot_message text,
  add column if not exists expires_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists market_order_id uuid,
  add column if not exists last_price_updated_at timestamptz;

update tukibot_negotiations
set
  quantity = coalesce(quantity, 1),
  expires_at = coalesce(expires_at, timeout_at, created_at + interval '24 hours')
where quantity is null
   or expires_at is null;

alter table if exists tukibot_negotiations
  drop constraint if exists tukibot_negotiations_status_check;

alter table if exists tukibot_negotiations
  add constraint tukibot_negotiations_status_check check (
    status in (
      'accepted',
      'countered',
      'accepted_pending_payment',
      'paid',
      'timeout_auto_counter',
      'timeout_auto_accept',
      'timeout_pressure'
    )
  );

create index if not exists idx_tukibot_negotiations_vendor_status
  on tukibot_negotiations (vendor_id, status, updated_at desc);

create index if not exists idx_tukibot_negotiations_buyer_status
  on tukibot_negotiations (buyer_id, status, updated_at desc)
  where buyer_id is not null;

create index if not exists idx_tukibot_negotiations_expires_at
  on tukibot_negotiations (expires_at)
  where expires_at is not null;

alter table if exists market_orders
  add column if not exists negotiation_id uuid references tukibot_negotiations(id) on delete set null;

create index if not exists idx_market_orders_negotiation_id
  on market_orders (negotiation_id)
  where negotiation_id is not null;

create table if not exists tukibot_negotiation_messages (
  id uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null references tukibot_negotiations(id) on delete cascade,
  sender_role text not null check (sender_role in ('buyer', 'vendor', 'system')),
  sender_id text,
  sender_name text,
  message text not null check (char_length(btrim(message)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists idx_tukibot_negotiation_messages_negotiation
  on tukibot_negotiation_messages (negotiation_id, created_at asc);

alter table if exists tukibot_negotiation_messages enable row level security;

drop policy if exists tukibot_negotiation_messages_select_own on tukibot_negotiation_messages;
create policy tukibot_negotiation_messages_select_own
on tukibot_negotiation_messages
for select
to authenticated
using (
  exists (
    select 1
    from tukibot_negotiations n
    where n.id = negotiation_id
      and (
        n.vendor_id = auth.uid()::text
        or n.buyer_id = auth.uid()::text
      )
  )
);

drop policy if exists tukibot_negotiation_messages_insert_own on tukibot_negotiation_messages;
create policy tukibot_negotiation_messages_insert_own
on tukibot_negotiation_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from tukibot_negotiations n
    where n.id = negotiation_id
      and (
        n.vendor_id = auth.uid()::text
        or n.buyer_id = auth.uid()::text
      )
  )
);

drop policy if exists tukibot_negotiations_select_own on tukibot_negotiations;
create policy tukibot_negotiations_select_own
on tukibot_negotiations
for select
to authenticated
using (
  vendor_id = auth.uid()::text
  or buyer_id = auth.uid()::text
);

create or replace function fn_tukibot_cleanup_expired_negotiations()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_deleted integer := 0;
begin
  with deleted_rows as (
    delete from tukibot_negotiations
    where status in ('countered', 'accepted_pending_payment')
      and expires_at is not null
      and expires_at <= now()
    returning id
  )
  select count(*) into v_deleted from deleted_rows;

  return jsonb_build_object(
    'deleted', v_deleted,
    'executed_at', now()
  );
end;
$$;

revoke all on function fn_tukibot_cleanup_expired_negotiations() from public;
grant execute on function fn_tukibot_cleanup_expired_negotiations() to service_role;