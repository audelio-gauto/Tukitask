-- Migration 069: Make feed sync triggers tolerant to errors
-- The trg_orders_feed_sync trigger was blocking admin status updates
-- by propagating exceptions. Wrap with EXCEPTION handler so the
-- underlying UPDATE always succeeds even if feed sync fails.

CREATE OR REPLACE FUNCTION trg_orders_feed_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM fn_match_driver_feed(NEW.id);
      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.status IN ('pending', 'negotiating') AND OLD.status NOT IN ('pending', 'negotiating') THEN
        PERFORM fn_match_driver_feed(NEW.id);
      ELSIF NEW.status NOT IN ('pending', 'negotiating') AND OLD.status IN ('pending', 'negotiating') THEN
        DELETE FROM driver_feed WHERE order_id = NEW.id;
      END IF;
      RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
      DELETE FROM driver_feed WHERE order_id = OLD.id;
      RETURN OLD;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_orders_feed_sync error (ignored): % — %', SQLERRM, SQLSTATE;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END;

  RETURN NULL;
END;
$$;

-- Same tolerance for tecnico jobs feed trigger
CREATE OR REPLACE FUNCTION trg_tecnico_jobs_feed_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM fn_match_tecnico_feed(NEW.id);
      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.status = 'pending' AND OLD.status <> 'pending' THEN
        PERFORM fn_match_tecnico_feed(NEW.id);
      ELSIF NEW.status <> 'pending' AND OLD.status = 'pending' THEN
        DELETE FROM tecnico_feed WHERE job_id = NEW.id;
      END IF;
      RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
      DELETE FROM tecnico_feed WHERE job_id = OLD.id;
      RETURN OLD;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_tecnico_jobs_feed_sync error (ignored): % — %', SQLERRM, SQLSTATE;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END;

  RETURN NULL;
END;
$$;
