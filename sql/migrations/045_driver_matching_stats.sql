-- 045_driver_matching_stats.sql
-- Adds matching/scoring columns to driver_profiles for intelligent driver ranking.
--
-- Fields:
--   total_offers_sent    — number of offers the driver has submitted
--   total_orders_ignored — number of pending orders the driver explicitly ignored
--   acceptance_rate      — total_offers_sent / (total_offers_sent + total_orders_ignored)
--                          Ranges 0.0..1.0. NULL until first offer or dismiss.
--   avg_response_seconds — rolling average seconds from order creation to driver's first offer
--                          NULL until first offer submitted.

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS total_offers_sent     INTEGER    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_orders_ignored  INTEGER    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acceptance_rate       NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS avg_response_seconds  INTEGER;

-- Backfill acceptance_rate for existing rows that already have offers recorded
-- (all start at NULL / unknown — will compute naturally as data comes in)

-- Helper function: recompute acceptance_rate from counters
CREATE OR REPLACE FUNCTION recompute_acceptance_rate(p_email TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sent    INTEGER;
  v_ignored INTEGER;
  v_rate    NUMERIC(5,4);
BEGIN
  SELECT total_offers_sent, total_orders_ignored
    INTO v_sent, v_ignored
    FROM driver_profiles
   WHERE email = p_email;

  IF (v_sent + v_ignored) > 0 THEN
    v_rate := v_sent::NUMERIC / (v_sent + v_ignored)::NUMERIC;
  ELSE
    v_rate := NULL;
  END IF;

  UPDATE driver_profiles
     SET acceptance_rate = v_rate
   WHERE email = p_email;
END;
$$;

-- RPC: record a driver dismissing an order (called from API)
CREATE OR REPLACE FUNCTION record_driver_dismiss(p_driver_email TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO driver_profiles (email, total_orders_ignored)
  VALUES (p_driver_email, 1)
  ON CONFLICT (email) DO UPDATE
    SET total_orders_ignored = driver_profiles.total_orders_ignored + 1;

  PERFORM recompute_acceptance_rate(p_driver_email);
END;
$$;

-- RPC: record a driver submitting an offer (called from API)
-- Also updates rolling avg_response_seconds
CREATE OR REPLACE FUNCTION record_driver_offer(
  p_driver_email      TEXT,
  p_response_seconds  INTEGER   -- seconds from order.created_at to now()
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old_avg  INTEGER;
  v_old_sent INTEGER;
  v_new_avg  INTEGER;
BEGIN
  SELECT avg_response_seconds, total_offers_sent
    INTO v_old_avg, v_old_sent
    FROM driver_profiles
   WHERE email = p_driver_email;

  -- Rolling weighted average
  IF v_old_avg IS NULL OR v_old_sent = 0 THEN
    v_new_avg := p_response_seconds;
  ELSE
    v_new_avg := ((v_old_avg * v_old_sent) + p_response_seconds) / (v_old_sent + 1);
  END IF;

  INSERT INTO driver_profiles (email, total_offers_sent, avg_response_seconds)
  VALUES (p_driver_email, 1, v_new_avg)
  ON CONFLICT (email) DO UPDATE
    SET total_offers_sent    = driver_profiles.total_offers_sent + 1,
        avg_response_seconds = v_new_avg;

  PERFORM recompute_acceptance_rate(p_driver_email);
END;
$$;
