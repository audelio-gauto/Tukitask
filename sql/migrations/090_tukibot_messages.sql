-- 090_tukibot_messages.sql
-- Mensajes fallback editables y con rotación aleatoria para TukiBot.
-- Tipos:
--   accepted_single   → oferta aceptada, 1 unidad
--   accepted_multi    → oferta aceptada, múltiples unidades
--   countered_single  → contraoferta, 1 unidad
--   countered_multi   → contraoferta, múltiples unidades
-- Placeholders soportados en el texto:
--   {precio}   → precio final unitario con formato Gs.
--   {total}    → total con cantidad (solo multi)
--   {ahorro}   → ahorro vs precio publicado
--   {producto} → nombre del producto

create table if not exists tukibot_messages (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null
    check (tipo in ('accepted_single','accepted_multi','countered_single','countered_multi')),
  texto       text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_tukibot_messages_tipo_activo
  on tukibot_messages (tipo, activo);

alter table tukibot_messages enable row level security;

-- Solo admin puede leer y modificar
drop policy if exists "admin_all_tukibot_messages" on tukibot_messages;
create policy "admin_all_tukibot_messages"
  on tukibot_messages for all
  using (
    exists (
      select 1 from users
      where id::text = auth.uid()::text
        and role = 'admin'
    )
  );

-- La route de negociación (service role) puede leer sin RLS
-- El service_role key bypasea RLS automáticamente en Supabase.

-- GRANT explícito requerido desde oct 2026 para que PostgREST exponga la tabla.
grant select, insert, update, delete on tukibot_messages to authenticated;
grant select on tukibot_messages to anon;
