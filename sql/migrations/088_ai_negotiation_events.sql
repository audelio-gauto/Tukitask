-- 088_ai_negotiation_events.sql
-- Production telemetry table for AI negotiation observability and alerting.

create table if not exists ai_negotiation_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vendor_id text,
  buyer_id text,
  product_id text,
  provider text not null default 'gemini'
    check (provider in ('gemini', 'openai', 'none')),
  model text,
  ai_enabled boolean not null default true,
  ai_used boolean not null default false,
  ai_success boolean not null default false,
  fallback_reason text,
  latency_ms int,
  status text not null
    check (status in ('accepted', 'countered')),
  quantity int not null default 1,
  listed_price numeric,
  floor_price numeric,
  buyer_offer numeric,
  final_amount numeric,
  negotiation_profile text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_ai_neg_events_created_at
  on ai_negotiation_events (created_at desc);

create index if not exists idx_ai_neg_events_vendor_created
  on ai_negotiation_events (vendor_id, created_at desc)
  where vendor_id is not null;

create index if not exists idx_ai_neg_events_provider_created
  on ai_negotiation_events (provider, created_at desc);

create index if not exists idx_ai_neg_events_status_created
  on ai_negotiation_events (status, created_at desc);

create index if not exists idx_ai_neg_events_ai_used_created
  on ai_negotiation_events (ai_used, created_at desc);

alter table ai_negotiation_events enable row level security;

drop policy if exists "admin_read_ai_negotiation_events" on ai_negotiation_events;
create policy "admin_read_ai_negotiation_events"
  on ai_negotiation_events for select
  using (
    exists (
      select 1
      from users
      where id::text = auth.uid()::text
        and role = 'admin'
    )
  );
