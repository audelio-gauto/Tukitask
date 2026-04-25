-- Migration 045: Disk IO optimization indexes
-- Reduces sequential scans on high-frequency query paths
-- Run this migration to significantly reduce Supabase Disk IO consumption

-- Orders: status + created_at for marketplace queries (available orders feed)
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders(status, created_at DESC);

-- Orders: driver history queries (filter by accepted_by + status + date)
CREATE INDEX IF NOT EXISTS idx_orders_accepted_by_status
  ON orders(accepted_by, status, created_at DESC);

-- Orders: client's own orders (filter by client_email + status)
CREATE INDEX IF NOT EXISTS idx_orders_client_email_status
  ON orders(client_email, status, created_at DESC);

-- Driver offers: offers per order + status (realtime filter + offer listing)
CREATE INDEX IF NOT EXISTS idx_driver_offers_order_id_status
  ON driver_offers(order_id, status);

-- Driver offers: driver's own sent offers
CREATE INDEX IF NOT EXISTS idx_driver_offers_driver_email
  ON driver_offers(driver_email, created_at DESC);

-- Tecnico jobs: marketplace feed (status + created_at — most frequent query)
CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_status_created
  ON tecnico_jobs(status, created_at DESC);

-- Tecnico jobs: tecnico's active/history jobs
CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_tecnico_email_status
  ON tecnico_jobs(tecnico_email, status);

-- Tecnico jobs: client's own service requests
CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_client_email_status
  ON tecnico_jobs(client_email, status);

-- Tecnico job offers: offers per job + status
CREATE INDEX IF NOT EXISTS idx_tecnico_job_offers_job_id_status
  ON tecnico_job_offers(job_id, status);

-- Tecnico job offers: tecnico's own sent offers
CREATE INDEX IF NOT EXISTS idx_tecnico_job_offers_tecnico_email
  ON tecnico_job_offers(tecnico_email, created_at DESC);

-- Chat messages: conversation thread (order-based chats)
CREATE INDEX IF NOT EXISTS idx_chat_messages_order_id
  ON chat_messages(order_id, created_at ASC);

-- Chat messages: conversation thread (job-based chats)
CREATE INDEX IF NOT EXISTS idx_chat_messages_job_id
  ON chat_messages(job_id, created_at ASC);

-- Chat messages: unread count queries (partial index — only unread rows)
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
  ON chat_messages(order_id, sender_email, read_at)
  WHERE read_at IS NULL;

-- Driver locations: position lookup by driver email
CREATE INDEX IF NOT EXISTS idx_driver_locations_email
  ON driver_locations(driver_email);

-- Notifications: user's unread notifications feed (column is 'read', not 'is_read')
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications(user_email, read, created_at DESC);
