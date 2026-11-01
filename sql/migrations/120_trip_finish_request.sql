-- 120: Finalizar remis lejos del destino con confirmación del cliente
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS finish_request_status  TEXT,
  ADD COLUMN IF NOT EXISTS finish_request_kind    TEXT,
  ADD COLUMN IF NOT EXISTS finish_request_amount  NUMERIC,
  ADD COLUMN IF NOT EXISTS finish_request_dist_m  INTEGER,
  ADD COLUMN IF NOT EXISTS finish_request_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_offer         NUMERIC;
