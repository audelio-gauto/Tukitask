-- 092_explicit_grants.sql
-- Supabase anuncia que desde oct 2026 los GRANTs automáticos en public
-- serán eliminados. Esta migración los vuelve explícitos para todas
-- las tablas existentes del proyecto.
-- Referencia: https://github.com/orgs/supabase/discussions/45329

-- ─────────────────────────────────────────────────────────────────────────────
-- Tablas públicas (anon + authenticated pueden leer; escritura solo authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
grant select on products                   to anon, authenticated;
grant select on categories                 to anon, authenticated;
grant select on vendors                    to anon, authenticated;
grant select on app_settings               to anon, authenticated;
grant select on pricing_config             to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tablas de usuarios autenticados
-- ─────────────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on users                   to authenticated;
grant select, insert, update, delete on orders                  to authenticated;
grant select, insert, update, delete on order_stops             to authenticated;
grant select, insert, update, delete on driver_offers           to authenticated;
grant select, insert, update, delete on tukibot_negotiations    to authenticated;
grant select, insert, update, delete on ratings                 to authenticated;
grant select, insert, update, delete on notifications           to authenticated;
grant select, insert, update, delete on wallet_transactions     to authenticated;
grant select, insert, update, delete on driver_locations        to authenticated;
grant select, insert, update, delete on driver_profiles         to authenticated;
grant select, insert, update, delete on tecnico_jobs            to authenticated;
grant select, insert, update, delete on mandaditos              to authenticated;
grant select, insert, update, delete on tips                    to authenticated;
grant select, insert, update, delete on favorites               to authenticated;
grant select, insert, update, delete on promotions              to authenticated;
grant select, insert, update, delete on commissions             to authenticated;
grant select, insert, update, delete on tecnico_commissions     to authenticated;
grant select, insert, update, delete on scheduled_services      to authenticated;
grant select, insert, update, delete on failed_deliveries       to authenticated;
grant select, insert, update, delete on return_attempts         to authenticated;
grant select, insert, update, delete on ai_negotiation_events   to authenticated;
grant select, insert, update, delete on tukibot_messages        to authenticated;
grant select, insert, update, delete on bank_aliases            to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Secuencias (si usás serial/bigserial en lugar de uuid)
-- ─────────────────────────────────────────────────────────────────────────────
grant usage, select on all sequences in schema public to authenticated;

-- Nota: RLS sigue controlando qué filas ve cada usuario.
-- Estos GRANTs solo permiten que PostgREST "vea" las tablas.
-- El service_role key bypasea tanto RLS como GRANTs.
