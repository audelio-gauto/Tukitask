-- 118: Compartir viaje (enlace público de seguimiento) y alertas SOS
CREATE TABLE IF NOT EXISTS trip_shares (
  token       TEXT        PRIMARY KEY,
  order_id    UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '12 hours')
);
CREATE INDEX IF NOT EXISTS trip_shares_order_idx ON trip_shares(order_id);

CREATE TABLE IF NOT EXISTS sos_alerts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID        REFERENCES orders(id) ON DELETE SET NULL,
  user_email   TEXT        NOT NULL,
  user_role    TEXT        NOT NULL CHECK (user_role IN ('cliente','driver')),
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  status       TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  admin_note   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sos_alerts_status_idx  ON sos_alerts(status, created_at DESC);

-- Todo el acceso pasa por la API con service role; los usuarios no leen estas tablas directamente
ALTER TABLE trip_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_alerts  ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  CREATE POLICY "service_role_all" ON trip_shares FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "service_role_all" ON sos_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
