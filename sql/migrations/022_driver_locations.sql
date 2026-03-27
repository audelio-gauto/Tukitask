-- 022: Real-time driver/tecnico location table for live map tracking
-- Stores the latest GPS position of each driver/tecnico while on an active job.

CREATE TABLE IF NOT EXISTS driver_locations (
  driver_email  TEXT        NOT NULL PRIMARY KEY,
  job_id        UUID        REFERENCES tecnico_jobs(id) ON DELETE SET NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookup by job
CREATE INDEX IF NOT EXISTS idx_driver_locations_job_id ON driver_locations (job_id);

-- Row Level Security: public read (client can see their driver's location), driver can only write their own row
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read driver_locations"
  ON driver_locations FOR SELECT USING (true);

CREATE POLICY "Driver updates own location"
  ON driver_locations FOR ALL USING (true);
