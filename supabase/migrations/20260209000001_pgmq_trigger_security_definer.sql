-- Fix: trigger functions that call pgmq.send() need SECURITY DEFINER
-- so they run as the function owner (postgres) who has full access to
-- the pgmq schema. Without this, any role inserting into the trigger's
-- source table gets "permission denied for schema pgmq".

---------------------------------------------------------------------
-- [enqueue_object_embedding_job] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enqueue_object_embedding_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM pgmq.send(
    queue_name := 'grida_library_object_worker_jobs'::text,
    msg := jsonb_build_object(
      'object_id', NEW.id,
      'path', NEW.path,
      'mimetype', NEW.mimetype
    )
  );
  RETURN NEW;
END;
$$;

-- Lock down: SECURITY DEFINER in public schema must not be callable by untrusted roles.
REVOKE ALL ON FUNCTION enqueue_object_embedding_job() FROM PUBLIC;


---------------------------------------------------------------------
-- [enqueue_new_organization_event] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_hosted.enqueue_new_organization_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM pgmq.send(
    queue_name := 'grida_hosted_evt_new_organization_jobs'::text,
    msg := jsonb_build_object(
      'object', 'evt_new_organization',
      'organization_id', NEW.id,
      'timestamp', now()
    )
  );
  RETURN NEW;
END;
$$;
