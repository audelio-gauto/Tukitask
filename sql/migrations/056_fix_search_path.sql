-- Migration 056: Fix mutable search_path on trg_chat_threads_sync (06 May 2026)
-- Resolves Supabase security advisory "function_search_path_mutable".
-- Adding SET search_path = public prevents search_path injection attacks.

CREATE OR REPLACE FUNCTION public.trg_chat_threads_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_client TEXT;
  v_worker TEXT;
  v_other  TEXT;
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    SELECT client_email, accepted_by
      INTO v_client, v_worker
    FROM public.orders
    WHERE id = NEW.order_id;

    IF v_client IS NULL AND v_worker IS NULL THEN
      RETURN NEW;
    END IF;

    v_other := CASE WHEN NEW.sender_email = v_client THEN v_worker ELSE v_client END;

    -- Update sender row (unread = 0, update preview)
    INSERT INTO public.chat_threads (user_email, order_id, unread_count, last_message_at, last_message, last_sender_email, updated_at)
    VALUES (NEW.sender_email, NEW.order_id, 0, NEW.created_at, NEW.content, NEW.sender_email, now())
    ON CONFLICT (user_email, order_id) WHERE order_id IS NOT NULL
    DO UPDATE SET
      last_message_at   = EXCLUDED.last_message_at,
      last_message      = EXCLUDED.last_message,
      last_sender_email = EXCLUDED.last_sender_email,
      updated_at        = now();

    -- Increment recipient unread count
    IF v_other IS NOT NULL THEN
      INSERT INTO public.chat_threads (user_email, order_id, unread_count, last_message_at, last_message, last_sender_email, updated_at)
      VALUES (v_other, NEW.order_id, 1, NEW.created_at, NEW.content, NEW.sender_email, now())
      ON CONFLICT (user_email, order_id) WHERE order_id IS NOT NULL
      DO UPDATE SET
        unread_count      = chat_threads.unread_count + 1,
        last_message_at   = EXCLUDED.last_message_at,
        last_message      = EXCLUDED.last_message,
        last_sender_email = EXCLUDED.last_sender_email,
        updated_at        = now();
    END IF;

  ELSIF NEW.job_id IS NOT NULL THEN
    SELECT client_email, tecnico_email
      INTO v_client, v_worker
    FROM public.tecnico_jobs
    WHERE id = NEW.job_id;

    IF v_client IS NULL AND v_worker IS NULL THEN
      RETURN NEW;
    END IF;

    v_other := CASE WHEN NEW.sender_email = v_client THEN v_worker ELSE v_client END;

    -- Update sender row (unread = 0, update preview)
    INSERT INTO public.chat_threads (user_email, job_id, unread_count, last_message_at, last_message, last_sender_email, updated_at)
    VALUES (NEW.sender_email, NEW.job_id, 0, NEW.created_at, NEW.content, NEW.sender_email, now())
    ON CONFLICT (user_email, job_id) WHERE job_id IS NOT NULL
    DO UPDATE SET
      last_message_at   = EXCLUDED.last_message_at,
      last_message      = EXCLUDED.last_message,
      last_sender_email = EXCLUDED.last_sender_email,
      updated_at        = now();

    -- Increment recipient unread count
    IF v_other IS NOT NULL THEN
      INSERT INTO public.chat_threads (user_email, job_id, unread_count, last_message_at, last_message, last_sender_email, updated_at)
      VALUES (v_other, NEW.job_id, 1, NEW.created_at, NEW.content, NEW.sender_email, now())
      ON CONFLICT (user_email, job_id) WHERE job_id IS NOT NULL
      DO UPDATE SET
        unread_count      = chat_threads.unread_count + 1,
        last_message_at   = EXCLUDED.last_message_at,
        last_message      = EXCLUDED.last_message,
        last_sender_email = EXCLUDED.last_sender_email,
        updated_at        = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
