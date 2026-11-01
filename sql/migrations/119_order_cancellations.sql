-- 119: Registro de cancelaciones (reasignación automática, penalización y motivos)
CREATE TABLE IF NOT EXISTS order_cancellations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  cancelled_by  TEXT        NOT NULL CHECK (cancelled_by IN ('driver','cliente')),
  user_email    TEXT        NOT NULL,
  reason        TEXT,
  reassigned    BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_cancellations_order_idx  ON order_cancellations(order_id, user_email);
CREATE INDEX IF NOT EXISTS order_cancellations_user_idx   ON order_cancellations(user_email, cancelled_by, created_at DESC);

ALTER TABLE order_cancellations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  CREATE POLICY "service_role_all" ON order_cancellations FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
