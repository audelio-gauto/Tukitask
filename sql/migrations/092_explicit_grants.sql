-- 092_explicit_grants.sql
-- Supabase anuncia que desde oct 2026 los GRANTs automáticos en public
-- serán eliminados. Esta migración los vuelve explícitos para todas
-- las tablas existentes del proyecto.
-- Referencia: https://github.com/orgs/supabase/discussions/45329
--
-- Usa DO $$ para ignorar tablas que aún no existen en este entorno.

DO $$
DECLARE
  t text;
  -- Tablas que anon + authenticated pueden leer (solo lectura pública)
  anon_readable text[] := ARRAY[
    'app_settings', 'app_config', 'pricing_settings',
    'package_multipliers', 'vehicle_pricing', 'payment_methods_config',
    'negotiation_limits', 'service_pricing', 'commission_rules',
    'products', 'store_configs', 'promo_codes'
  ];
  -- Tablas de uso autenticado (lectura + escritura)
  auth_full text[] := ARRAY[
    'orders', 'order_stops', 'order_tips',
    'driver_offers', 'driver_locations', 'driver_wallets',
    'driver_favorites', 'driver_documents', 'driver_document_audit',
    'driver_feed', 'client_profiles',
    'tecnico_jobs', 'tecnico_job_offers', 'tecnico_feed',
    'wallet_transactions', 'recharge_requests', 'bank_alias',
    'notifications', 'push_tokens',
    'chat_messages', 'chat_threads',
    'tukibot_negotiations', 'tukibot_messages', 'ai_negotiation_events',
    'market_orders', 'vendor_bot_config',
    'promo_code_uses', 'reports', 'admin_audit_log',
    'commission_rules', 'negotiation_limits'
  ];
BEGIN
  -- Grants de solo lectura (anon + authenticated)
  FOREACH t IN ARRAY anon_readable LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('GRANT SELECT ON %I TO anon, authenticated', t);
      RAISE NOTICE 'GRANT SELECT ON % TO anon, authenticated — OK', t;
    ELSE
      RAISE NOTICE 'SKIP: tabla % no existe', t;
    END IF;
  END LOOP;

  -- Grants completos (authenticated)
  FOREACH t IN ARRAY auth_full LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
      RAISE NOTICE 'GRANT ALL ON % TO authenticated — OK', t;
    ELSE
      RAISE NOTICE 'SKIP: tabla % no existe', t;
    END IF;
  END LOOP;

  -- Secuencias (para tablas con bigserial como driver_feed, tecnico_feed)
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  RAISE NOTICE 'GRANT sequences — OK';
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Tablas de configuración (anon puede leer; authenticated lee y escribe)
-- ─────────────────────────────────────────────────────────────────────────────
grant select on app_settings             to anon, authenticated;
grant select on app_config               to anon, authenticated;
grant select on pricing_settings         to anon, authenticated;
grant select on package_multipliers      to anon, authenticated;
grant select on vehicle_pricing          to anon, authenticated;
grant select on payment_methods_config   to anon, authenticated;
grant select on negotiation_limits       to anon, authenticated;
grant select on service_pricing          to anon, authenticated;
grant select on commission_rules         to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tablas de catálogo / marketplace
-- ─────────────────────────────────────────────────────────────────────────────
grant select on products                 to anon, authenticated;
grant select on store_configs            to anon, authenticated;
grant select on promo_codes              to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tablas de usuarios autenticados
-- ─────────────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on orders                  to authenticated;
grant select, insert, update, delete on order_stops             to authenticated;
grant select, insert, update, delete on order_tips              to authenticated;
grant select, insert, update, delete on driver_offers           to authenticated;
grant select, insert, update, delete on driver_locations        to authenticated;
grant select, insert, update, delete on driver_wallets          to authenticated;
grant select, insert, update, delete on driver_favorites        to authenticated;
grant select, insert, update, delete on driver_documents        to authenticated;
grant select, insert, update, delete on driver_document_audit   to authenticated;
grant select, insert, update, delete on driver_feed             to authenticated;
grant select, insert, update, delete on client_profiles         to authenticated;
grant select, insert, update, delete on tecnico_jobs            to authenticated;
grant select, insert, update, delete on tecnico_job_offers      to authenticated;
grant select, insert, update, delete on tecnico_feed            to authenticated;
grant select, insert, update, delete on wallet_transactions     to authenticated;
grant select, insert, update, delete on recharge_requests       to authenticated;
grant select, insert, update, delete on bank_alias              to authenticated;
grant select, insert, update, delete on notifications           to authenticated;
grant select, insert, update, delete on push_tokens             to authenticated;
grant select, insert, update, delete on chat_messages           to authenticated;
grant select, insert, update, delete on chat_threads            to authenticated;
grant select, insert, update, delete on tukibot_negotiations    to authenticated;
grant select, insert, update, delete on tukibot_messages        to authenticated;
grant select, insert, update, delete on ai_negotiation_events   to authenticated;
grant select, insert, update, delete on market_orders           to authenticated;
grant select, insert, update, delete on vendor_bot_config       to authenticated;
grant select, insert, update, delete on promo_code_uses         to authenticated;
grant select, insert, update, delete on reports                 to authenticated;
grant select, insert, update, delete on admin_audit_log         to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Secuencias (driver_feed y tecnico_feed usan bigserial)
-- ─────────────────────────────────────────────────────────────────────────────
grant usage, select on all sequences in schema public to authenticated;

-- Nota: RLS sigue controlando qué filas ve cada usuario.
-- Estos GRANTs solo permiten que PostgREST "vea" las tablas.
-- El service_role key bypasea tanto RLS como GRANTs.
