-- ============================================================
-- 043: Security fixes, missing indexes, DB constraints
--
-- Fixes:
--  1. RLS en driver_locations: cualquier driver podía sobreescribir
--     la ubicación de otro → restringir a propio email
--  2. Índices faltantes en orders (accepted_by, client_email)
--  3. Índices faltantes en tecnico_jobs (client_email, tecnico_email)
--  4. FK desde wallet_transactions → driver_wallets
--  5. Index de limpieza para notifications (lect antiguas)
--  6. completion_attempts NOT NULL DEFAULT 0 en tecnico_jobs
-- ============================================================

-- ── 1. Fix driver_locations RLS ──────────────────────────────
-- VULNERABILIDAD: policy anterior usaba USING(true) sin filtro de email
-- → cualquier driver autenticado podía actualizar la ubicación de otro.
DROP POLICY IF EXISTS "Driver updates own location" ON driver_locations;

CREATE POLICY "driver_own_write"
  ON driver_locations FOR ALL
  TO authenticated
  USING    (driver_email = auth.email())
  WITH CHECK (driver_email = auth.email());

-- Asegurar que service_role (API routes) sigue teniendo acceso total
DROP POLICY IF EXISTS "driver_locations_service_role" ON driver_locations;
CREATE POLICY "driver_locations_service_role"
  ON driver_locations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ── 2. Índices faltantes en orders ───────────────────────────
-- orders já tiene idx_orders_status y idx_orders_created_at (006)
-- pero le faltaban filtros por driver y por cliente.
CREATE INDEX IF NOT EXISTS idx_orders_accepted_by
  ON orders(accepted_by);

CREATE INDEX IF NOT EXISTS idx_orders_client_email
  ON orders(client_email);

-- Composite para el dashboard de stats del driver (status + fecha)
CREATE INDEX IF NOT EXISTS idx_orders_driver_status
  ON orders(accepted_by, status, created_at DESC);

-- Composite para historial del cliente
CREATE INDEX IF NOT EXISTS idx_orders_client_status
  ON orders(client_email, status, created_at DESC);

-- ── 3. Índices faltantes en tecnico_jobs ─────────────────────
CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_client
  ON tecnico_jobs(client_email, status);

CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_tecnico
  ON tecnico_jobs(tecnico_email, status);

-- ── 4. FK wallet_transactions → driver_wallets ───────────────
-- Evita transacciones huérfanas si la billetera es borrada.
-- ON DELETE CASCADE: si se borra la billetera, se borran las transacciones.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_wt_wallet'
      AND table_name = 'wallet_transactions'
  ) THEN
    ALTER TABLE wallet_transactions
      ADD CONSTRAINT fk_wt_wallet
      FOREIGN KEY (driver_email)
      REFERENCES driver_wallets(driver_email)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ── 5. Index para limpieza periódica de notifications ────────
-- Accelera DELETE ... WHERE read = true AND created_at < X
CREATE INDEX IF NOT EXISTS idx_notifications_cleanup
  ON notifications(created_at DESC) WHERE read = true;

-- ── 6. completion_attempts NOT NULL DEFAULT 0 ────────────────
-- NULL + 1 = NULL en PostgreSQL; el código app hace COALESCE pero
-- mejor garantizarlo a nivel DB.
UPDATE tecnico_jobs SET completion_attempts = 0 WHERE completion_attempts IS NULL;
ALTER TABLE tecnico_jobs
  ALTER COLUMN completion_attempts SET DEFAULT 0,
  ALTER COLUMN completion_attempts SET NOT NULL;
