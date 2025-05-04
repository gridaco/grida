---------------------------------------------------------------------
-- [enqueue_object_embedding_job] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enqueue_object_embedding_job()
RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql;


-- drop legacy clipl14
DROP TABLE IF EXISTS grida_library.object_embedding_clip_l14 CASCADE;
