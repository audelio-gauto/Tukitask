-- 028: Habilitar RLS en tablas que lo tenían deshabilitado
-- Todas las APIs usan SUPABASE_SERVICE_ROLE_KEY (sbAdmin) que omite RLS.
-- Las políticas protegen el acceso directo desde el cliente browser (anon/auth key).
-- ===========================================================================

-- ── tecnico_settings ────────────────────────────────────────────────────────
ALTER TABLE public.tecnico_settings ENABLE ROW LEVEL SECURITY;

-- El técnico solo puede leer y editar su propia fila
CREATE POLICY "ts_own" ON public.tecnico_settings
  FOR ALL USING (email = auth.email());

-- El service role puede hacer todo (APIs del servidor)
CREATE POLICY "ts_service_role" ON public.tecnico_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── driver_profiles ─────────────────────────────────────────────────────────
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;

-- El driver solo puede leer y editar su propio perfil
CREATE POLICY "dp_own" ON public.driver_profiles
  FOR ALL USING (email = auth.email());

-- Usuarios autenticados pueden leer perfiles (necesario para mostrar rating al cliente)
CREATE POLICY "dp_auth_read" ON public.driver_profiles
  FOR SELECT TO authenticated USING (true);

-- El service role puede hacer todo
CREATE POLICY "dp_service_role" ON public.driver_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── service_pricing ─────────────────────────────────────────────────────────
ALTER TABLE public.service_pricing ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer (se usa en el formulario de solicitud)
CREATE POLICY "sp_auth_read" ON public.service_pricing
  FOR SELECT TO authenticated USING (true);

-- Solo el service role puede escribir (admin panel)
CREATE POLICY "sp_service_role" ON public.service_pricing
  FOR ALL TO service_role USING (true) WITH CHECK (true);
