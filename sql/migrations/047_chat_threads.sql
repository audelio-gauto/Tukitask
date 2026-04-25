-- Migration 047: Chat threads (unread counters)
--
-- NOTE: order_id and job_id are nullable (one XOR the other is set per row).
-- PostgreSQL PRIMARY KEY forces NOT NULL on all key columns, which would break
-- nullable columns. Fix: use BIGSERIAL surrogate PK + two partial UNIQUE indexes.

CREATE TABLE IF NOT EXISTS chat_threads (
  id               BIGSERIAL PRIMARY KEY,
  user_email       TEXT NOT NULL,
  order_id         UUID,
  job_id           UUID,
  unread_count     INTEGER NOT NULL DEFAULT 0,
  last_message_at  TIMESTAMPTZ,
  last_message     TEXT,
  last_sender_email TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_threads_order_or_job CHECK ((order_id IS NOT NULL) <> (job_id IS NOT NULL))
);

-- Partial unique indexes replace the composite PK for conflict resolution
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_order_user
  ON chat_threads(user_email, order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_job_user
  ON chat_threads(user_email, job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_threads_user_last
  ON chat_threads(user_email, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_threads_user_unread
  ON chat_threads(user_email)
  WHERE unread_count > 0;

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_threads_select_own ON chat_threads;
CREATE POLICY chat_threads_select_own
  ON chat_threads
  FOR SELECT
  USING (user_email = auth.email());

DROP POLICY IF EXISTS chat_threads_update_own ON chat_threads;
CREATE POLICY chat_threads_update_own
  ON chat_threads
  FOR UPDATE
  USING (user_email = auth.email());

CREATE OR REPLACE FUNCTION trg_chat_threads_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_client TEXT;
  v_worker TEXT;
  v_other  TEXT;
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    SELECT client_email, accepted_by
      INTO v_client, v_worker
    FROM orders
    WHERE id = NEW.order_id;

    IF v_client IS NULL AND v_worker IS NULL THEN
      RETURN NEW;
    END IF;

    v_other := CASE WHEN NEW.sender_email = v_client THEN v_worker ELSE v_client END;

    -- Update sender row (unread = 0, update preview)
    INSERT INTO chat_threads (user_email, order_id, unread_count, last_message_at, last_message, last_sender_email, updated_at)
    VALUES (NEW.sender_email, NEW.order_id, 0, NEW.created_at, NEW.content, NEW.sender_email, now())
    ON CONFLICT (user_email, order_id) WHERE order_id IS NOT NULL
    DO UPDATE SET
      last_message_at   = EXCLUDED.last_message_at,
      last_message      = EXCLUDED.last_message,
      last_sender_email = EXCLUDED.last_sender_email,
      updated_at        = now();

    -- Increment recipient unread count
    IF v_other IS NOT NULL THEN
      INSERT INTO chat_threads (user_email, order_id, unread_count, last_message_at, last_message, last_sender_email, updated_at)
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
    FROM tecnico_jobs
    WHERE id = NEW.job_id;

    IF v_client IS NULL AND v_worker IS NULL THEN
      RETURN NEW;
    END IF;

    v_other := CASE WHEN NEW.sender_email = v_client THEN v_worker ELSE v_client END;

    -- Update sender row (unread = 0, update preview)
    INSERT INTO chat_threads (user_email, job_id, unread_count, last_message_at, last_message, last_sender_email, updated_at)
    VALUES (NEW.sender_email, NEW.job_id, 0, NEW.created_at, NEW.content, NEW.sender_email, now())
    ON CONFLICT (user_email, job_id) WHERE job_id IS NOT NULL
    DO UPDATE SET
      last_message_at   = EXCLUDED.last_message_at,
      last_message      = EXCLUDED.last_message,
      last_sender_email = EXCLUDED.last_sender_email,
      updated_at        = now();

    -- Increment recipient unread count
    IF v_other IS NOT NULL THEN
      INSERT INTO chat_threads (user_email, job_id, unread_count, last_message_at, last_message, last_sender_email, updated_at)
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

DROP TRIGGER IF EXISTS trg_chat_threads_ins ON chat_messages;
CREATE TRIGGER trg_chat_threads_ins
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION trg_chat_threads_sync();
