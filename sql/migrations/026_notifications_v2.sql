-- 026_notifications_v2.sql
-- Evolución del sistema de notificaciones: prioridad, TTL, expiración de ofertas,
-- deduplicación, reglas de negocio, y limpieza automática.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. PRIORITY LEVELS en notifications
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent', 'high', 'normal', 'silent'));

-- Index para queries de urgentes no leídas
CREATE INDEX IF NOT EXISTS idx_notifications_priority
  ON notifications (user_email, priority, read) WHERE read = false;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. DEDUPLICATION: group_key para agrupar notificaciones similares
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS group_key TEXT DEFAULT NULL;

-- Unique constraint parcial: solo 1 notificación no leída por grupo por usuario
-- Previene spam de "nueva oferta" / "nueva oferta" / "nueva oferta"
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup
  ON notifications (user_email, group_key) WHERE read = false AND group_key IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. OFFER EXPIRY: expires_at en driver_offers y tecnico_job_offers
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE driver_offers
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE tecnico_job_offers
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

-- Función para expirar ofertas viejas (llamar via pg_cron cada 30s o desde API)
CREATE OR REPLACE FUNCTION expire_stale_offers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Expirar ofertas de drivers
  UPDATE driver_offers
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  -- Expirar ofertas de técnicos
  UPDATE tecnico_job_offers
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. SMART CLEANUP: TTL configurable
-- ══════════════════════════════════════════════════════════════════════════════
-- Reemplazar la función de 30 días con una más granular
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Urgentes y altas: mantener 14 días
  DELETE FROM notifications
  WHERE priority IN ('urgent', 'high')
    AND created_at < NOW() - INTERVAL '14 days';

  -- Normales: mantener 7 días
  DELETE FROM notifications
  WHERE priority = 'normal'
    AND created_at < NOW() - INTERVAL '7 days';

  -- Silenciosas: mantener 3 días
  DELETE FROM notifications
  WHERE priority = 'silent'
    AND created_at < NOW() - INTERVAL '3 days';

  -- Leídas: máximo 3 días sin importar prioridad
  DELETE FROM notifications
  WHERE read = true
    AND created_at < NOW() - INTERVAL '3 days';
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. BUSINESS RULES: Función para emitir notificaciones con validación de estado
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION safe_emit_notification(
  p_user_email TEXT,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_group_key TEXT DEFAULT NULL,
  p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_job_id UUID;
  v_order_status TEXT;
  v_job_status TEXT;
  v_notif_id UUID;
BEGIN
  -- Extract IDs from data payload
  v_order_id := (p_data->>'order_id')::UUID;
  v_job_id := (p_data->>'job_id')::UUID;

  -- Business rule: no offer notifications if order is already accepted/completed
  IF p_type IN ('new_offer', 'new_job_offer') THEN
    IF v_order_id IS NOT NULL THEN
      SELECT status INTO v_order_status FROM orders WHERE id = v_order_id;
      IF v_order_status IS NOT NULL AND v_order_status NOT IN ('pending', 'negotiating') THEN
        RETURN NULL; -- Order already progressed, skip notification
      END IF;
    END IF;
    IF v_job_id IS NOT NULL THEN
      SELECT status INTO v_job_status FROM tecnico_jobs WHERE id = v_job_id;
      IF v_job_status IS NOT NULL AND v_job_status NOT IN ('pending', 'negotiating') THEN
        RETURN NULL; -- Job already progressed, skip notification
      END IF;
    END IF;
  END IF;

  -- Business rule: no status notifications for cancelled orders/jobs
  IF p_type IN ('status_change', 'job_status') THEN
    IF v_order_id IS NOT NULL THEN
      SELECT status INTO v_order_status FROM orders WHERE id = v_order_id;
      IF v_order_status = 'cancelled' THEN
        RETURN NULL;
      END IF;
    END IF;
    IF v_job_id IS NOT NULL THEN
      SELECT status INTO v_job_status FROM tecnico_jobs WHERE id = v_job_id;
      IF v_job_status = 'cancelled' THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  -- Dedup: if group_key exists and there's already an unread notification,
  -- update the existing one instead of inserting a duplicate
  IF p_group_key IS NOT NULL THEN
    UPDATE notifications
    SET title = p_title,
        body = p_body,
        data = p_data,
        priority = p_priority,
        created_at = NOW()
    WHERE user_email = LOWER(p_user_email)
      AND group_key = p_group_key
      AND read = false
    RETURNING id INTO v_notif_id;

    IF v_notif_id IS NOT NULL THEN
      RETURN v_notif_id; -- Updated existing, triggers realtime UPDATE
    END IF;
  END IF;

  -- Insert new notification
  INSERT INTO notifications (user_email, type, title, body, priority, group_key, data, read)
  VALUES (LOWER(p_user_email), p_type, p_title, p_body, p_priority, p_group_key, p_data, false)
  RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. SCHEDULED CLEANUP (si pg_cron está habilitado en Supabase Pro)
-- ══════════════════════════════════════════════════════════════════════════════
-- Descomenta si tienes pg_cron habilitado:
-- SELECT cron.schedule('cleanup-notifications', '0 3 * * *', 'SELECT cleanup_old_notifications()');
-- SELECT cron.schedule('expire-offers', '*/30 * * * * *', 'SELECT expire_stale_offers()');
