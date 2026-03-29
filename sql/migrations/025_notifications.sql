-- 025_notifications.sql
-- In-app notification system + push token storage (for future FCM/APNs)

-- ── Notifications table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email    TEXT NOT NULL,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  data          JSONB DEFAULT '{}'::jsonb,
  read          BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_email
  ON notifications (user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_email, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications (created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own notifications
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (auth.jwt() ->> 'email' = user_email);

CREATE POLICY "Users can mark own notifications read"
  ON notifications FOR UPDATE
  USING (auth.jwt() ->> 'email' = user_email)
  WITH CHECK (auth.jwt() ->> 'email' = user_email);

-- Service role can insert (from API routes)
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Enable realtime so clients receive notifications instantly
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ── Push tokens table (future FCM/APNs) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email    TEXT NOT NULL,
  token         TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_email, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON push_tokens (user_email);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push tokens"
  ON push_tokens FOR ALL
  USING (auth.jwt() ->> 'email' = user_email)
  WITH CHECK (auth.jwt() ->> 'email' = user_email);

-- ── Cleanup function: auto-delete notifications older than 30 days ───────────
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM notifications
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;
