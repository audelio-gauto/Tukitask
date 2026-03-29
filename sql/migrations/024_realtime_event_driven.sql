-- 024: Enable Supabase Realtime on critical tables + atomic tecnico offer acceptance
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)

-- ── Enable Realtime on tables that need instant push ─────────────────────────
-- orders: already enabled in 008
-- driver_offers: enable for INSERT/UPDATE so clients see offers + status changes
-- tecnico_jobs: enable so técnicos see new jobs, clients see status changes
-- tecnico_job_offers: enable so clients see new offers from técnicos
-- driver_locations: enable so clients can track driver/técnico in real time

DO $$
BEGIN
  -- driver_offers (may already be partially enabled)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE driver_offers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- tecnico_jobs
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE tecnico_jobs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- tecnico_job_offers
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE tecnico_job_offers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- driver_locations (GPS tracking)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ── Atomic accept_tecnico_offer (fixes race condition) ──────────────────────
-- Mirrors the existing accept_offer() for driver orders, but for tecnico jobs.
-- Uses FOR UPDATE to prevent double-acceptance.

CREATE OR REPLACE FUNCTION accept_tecnico_offer(
  p_offer_id     UUID,
  p_client_email TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offer  tecnico_job_offers%ROWTYPE;
  v_job    tecnico_jobs%ROWTYPE;
BEGIN
  -- Lock the offer row to prevent concurrent acceptance
  SELECT * INTO v_offer
  FROM tecnico_job_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer not found', 'status', 404);
  END IF;

  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer is no longer pending', 'status', 409);
  END IF;

  -- Lock the job row
  SELECT * INTO v_job
  FROM tecnico_jobs
  WHERE id = v_offer.job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found', 'status', 404);
  END IF;

  IF v_job.client_email != p_client_email THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your job', 'status', 403);
  END IF;

  IF v_job.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job already assigned', 'status', 409);
  END IF;

  -- Accept this offer
  UPDATE tecnico_job_offers
  SET status = 'accepted', responded_at = now()
  WHERE id = p_offer_id;

  -- Reject all other pending offers for this job
  UPDATE tecnico_job_offers
  SET status = 'rejected', responded_at = now()
  WHERE job_id = v_offer.job_id
    AND id != p_offer_id
    AND status = 'pending';

  -- Assign the job to the técnico
  UPDATE tecnico_jobs
  SET
    status        = 'accepted',
    accepted_at   = now(),
    tecnico_email = v_offer.tecnico_email,
    tecnico_name  = v_offer.tecnico_name,
    tecnico_photo = v_offer.tecnico_photo,
    agreed_price  = v_offer.proposed_price
  WHERE id = v_offer.job_id;

  RETURN jsonb_build_object(
    'success', true,
    'offer', row_to_json(v_offer),
    'tecnico_email', v_offer.tecnico_email
  );
END;
$$;
