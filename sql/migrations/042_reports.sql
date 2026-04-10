-- 042: Sistema de reportes/reclamos (estilo Uber/Rappi/InDrive)
CREATE TABLE IF NOT EXISTS reports (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_email TEXT        NOT NULL,
  reporter_role  TEXT        NOT NULL CHECK (reporter_role IN ('cliente','driver','tecnico')),
  reported_email TEXT        NOT NULL,
  reported_role  TEXT        NOT NULL CHECK (reported_role IN ('cliente','driver','tecnico')),
  reference_type TEXT        NOT NULL CHECK (reference_type IN ('order','job')),
  reference_id   UUID        NOT NULL,
  reason         TEXT        NOT NULL CHECK (reason IN (
    'no_llego','cobro_indebido','mal_comportamiento',
    'fraude','pago_no_realizado','maltrato','otro'
  )),
  comment        TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','reviewing','resolved','dismissed')),
  admin_note     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ
);

-- Prevent duplicate reports for the same reference by the same reporter
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_reporter_ref
  ON reports(reporter_email, reference_type, reference_id);

CREATE INDEX IF NOT EXISTS reports_status_idx       ON reports(status);
CREATE INDEX IF NOT EXISTS reports_reporter_idx     ON reports(reporter_email);
CREATE INDEX IF NOT EXISTS reports_reported_idx     ON reports(reported_email);
CREATE INDEX IF NOT EXISTS reports_created_at_idx   ON reports(created_at DESC);

-- RLS: enable but allow service role full access (admin API uses service role)
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
-- Users cannot read others' reports directly; all access goes through API
CREATE POLICY "service_role_all" ON reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);
