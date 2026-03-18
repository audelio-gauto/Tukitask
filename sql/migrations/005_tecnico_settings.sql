-- Migration: create tecnico_settings table

CREATE TABLE IF NOT EXISTS tecnico_settings (
  email text PRIMARY KEY,
  rango_km integer,
  accepted_services jsonb,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tecnico_settings_email ON tecnico_settings (email);
