-- 033: Driver & Tecnico document verification
-- Tabla para metadata de documentos (archivos en bucket privado)
CREATE TABLE IF NOT EXISTS driver_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_email   TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'driver' CHECK (role IN ('driver', 'tecnico')),
  doc_type       TEXT NOT NULL,
  file_path      TEXT NOT NULL,   -- path en bucket privado, nunca URL pública
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by    TEXT,            -- email del admin que revisó
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (driver_email, doc_type)  -- upsert: latest upload por tipo de doc
);

-- Columna de vencimiento para documentos que expiran
ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- RLS: cada conductor/técnico solo ve sus propios documentos
ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_select_own" ON driver_documents
  FOR SELECT USING (driver_email = auth.jwt()->>'email');

CREATE POLICY "doc_insert_own" ON driver_documents
  FOR INSERT WITH CHECK (driver_email = auth.jwt()->>'email');

-- Agregar campos de verificación en driver_profiles
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS verified             BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at          TIMESTAMPTZ;

-- Agregar campos de verificación en tecnico_settings
ALTER TABLE tecnico_settings
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS verified             BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at          TIMESTAMPTZ;

-- Bucket PRIVADO para documentos sensibles de conductores y técnicos
-- public = false → nadie puede acceder con URL pública
-- El admin genera signed URLs de vida corta desde el servidor
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-documents',
  'driver-documents',
  false,
  10485760, -- 10 MB máx
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;
