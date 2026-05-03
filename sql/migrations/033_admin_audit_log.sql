-- Migration 033: Admin audit log
-- Stores every admin action for accountability and debugging.

create table if not exists public.admin_audit_log (
  id          bigserial primary key,
  admin_email text        not null,
  action      text        not null,  -- e.g. 'cancel','set_status','reassign','adjust_wallet','suspend','reactivate'
  target_type text,                  -- 'order','tecnico','user','wallet'
  target_id   text,                  -- id of the affected entity
  metadata    jsonb,                 -- extra details (reason, amount, status, etc.)
  created_at  timestamptz not null default now()
);

-- Index for filtering by target (used in suspension history)
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_id, action);
-- Index for listing recent entries
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

-- Enable RLS — only admins can read
alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log_read" on public.admin_audit_log
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.role::text in ('admin', 'super_admin', 'owner')
    )
  );

-- Only service role can insert (backend only)
create policy "admin_audit_log_insert" on public.admin_audit_log
  for insert with check (false);
