-- 027_offer_client_email.sql
-- Agrega client_email a driver_offers y tecnico_job_offers para:
-- 1. Filtrar suscripciones Realtime por usuario (seguridad + rendimiento)
-- 2. Evitar que todos los clientes reciban todos los INSERT events globalmente

ALTER TABLE driver_offers
  ADD COLUMN IF NOT EXISTS client_email TEXT DEFAULT NULL;

ALTER TABLE tecnico_job_offers
  ADD COLUMN IF NOT EXISTS client_email TEXT DEFAULT NULL;

-- Índices para filtrar realtime y queries por cliente
CREATE INDEX IF NOT EXISTS idx_driver_offers_client_email
  ON driver_offers (client_email);

CREATE INDEX IF NOT EXISTS idx_tecnico_job_offers_client_email
  ON tecnico_job_offers (client_email);

-- Backfill: poblar client_email para filas existentes
UPDATE driver_offers d
SET client_email = o.client_email
FROM orders o
WHERE d.order_id = o.id
  AND d.client_email IS NULL;

UPDATE tecnico_job_offers t
SET client_email = j.client_email
FROM tecnico_jobs j
WHERE t.job_id = j.id
  AND t.client_email IS NULL;
