-- 046: Add performance indexes for high-traffic queries
-- Required for scale — without these, queries become full-table scans at 1M+ rows.

-- Orders: queried by client email and accepted_by (driver) on every poll
CREATE INDEX IF NOT EXISTS idx_orders_client_email
  ON public.orders (client_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_accepted_by
  ON public.orders (accepted_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON public.orders (status, created_at DESC);

-- Driver profiles: fetched by email on every login / offer flow
CREATE INDEX IF NOT EXISTS idx_driver_profiles_email
  ON public.driver_profiles (email);

-- Tecnico jobs: queried by tecnico_email + status constantly
CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_tecnico_email
  ON public.tecnico_jobs (tecnico_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_status
  ON public.tecnico_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tecnico_jobs_client_email
  ON public.tecnico_jobs (client_email, created_at DESC);

-- Driver wallets + transactions: queried on every wallet page open
CREATE INDEX IF NOT EXISTS idx_driver_wallets_driver_email
  ON public.driver_wallets (driver_email);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_driver_email
  ON public.wallet_transactions (driver_email, created_at DESC);

-- Recharge requests: admin wallet approval list
CREATE INDEX IF NOT EXISTS idx_recharge_requests_status
  ON public.recharge_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recharge_requests_driver_email
  ON public.recharge_requests (driver_email, created_at DESC);

-- Driver locations: updated every ~10s per active driver
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_email
  ON public.driver_locations (driver_email);

-- Chat messages: fetched per order/job
CREATE INDEX IF NOT EXISTS idx_chat_messages_order_id
  ON public.chat_messages (order_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_job_id
  ON public.chat_messages (job_id, created_at ASC)
  WHERE job_id IS NOT NULL;

-- Users: role filter used by admin dashboard COUNT queries
CREATE INDEX IF NOT EXISTS idx_users_role
  ON public.users (role, created_at DESC);
