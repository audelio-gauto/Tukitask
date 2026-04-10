-- ============================================================
-- 044: RPC atómica para accept_tecnico_offer
--
-- PROBLEMA: el endpoint POST /api/tecnico/jobs (action=accept_offer)
-- hacía tres UPDATEs secuenciales sin transacción → si llegaban dos
-- clientes al mismo tiempo, ambas respuestas podían asignar el mismo
-- técnico → doble asignación / condición de carrera.
--
-- SOLUCIÓN: un solo RPC en PostgreSQL con SELECT ... FOR UPDATE en
-- la oferta y en el job, garantizando exclusión mutua.
-- ============================================================

CREATE OR REPLACE FUNCTION accept_tecnico_offer(
  p_offer_id    UUID,
  p_client_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offer RECORD;
  v_job   RECORD;
  v_now   TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Bloquear la fila de la oferta (impide aceptaciones concurrentes)
  SELECT * INTO v_offer
    FROM tecnico_job_offers
   WHERE id = p_offer_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Oferta no encontrada', 'status', 404
    );
  END IF;

  IF v_offer.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'La oferta ya no está disponible', 'status', 409
    );
  END IF;

  -- 2. Bloquear el job y verificar propiedad + estado
  SELECT * INTO v_job
    FROM tecnico_jobs
   WHERE id = v_offer.job_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Trabajo no encontrado', 'status', 404
    );
  END IF;

  IF v_job.client_email <> p_client_email THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'No autorizado', 'status', 403
    );
  END IF;

  IF v_job.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'El trabajo ya fue asignado', 'status', 409
    );
  END IF;

  -- 3. Aceptar esta oferta
  UPDATE tecnico_job_offers
     SET status = 'accepted', responded_at = v_now
   WHERE id = p_offer_id;

  -- 4. Rechazar todas las demás ofertas pendientes del mismo job
  UPDATE tecnico_job_offers
     SET status = 'rejected', responded_at = v_now
   WHERE job_id = v_offer.job_id
     AND id     <> p_offer_id
     AND status = 'pending';

  -- 5. Asignar el job atómicamente
  UPDATE tecnico_jobs
     SET status        = 'accepted',
         accepted_at   = v_now,
         tecnico_email = v_offer.tecnico_email,
         tecnico_name  = v_offer.tecnico_name,
         tecnico_photo = v_offer.tecnico_photo,
         agreed_price  = v_offer.proposed_price
   WHERE id = v_offer.job_id;

  RETURN jsonb_build_object(
    'success',       true,
    'job_id',        v_offer.job_id,
    'offer_id',      p_offer_id,
    'tecnico_email', v_offer.tecnico_email,
    'tecnico_name',  v_offer.tecnico_name,
    'agreed_price',  v_offer.proposed_price
  );
END;
$$;

-- Revocar acceso público; solo service_role (server-side API) puede llamarla
REVOKE ALL ON FUNCTION accept_tecnico_offer(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION accept_tecnico_offer(UUID, TEXT) TO service_role;
