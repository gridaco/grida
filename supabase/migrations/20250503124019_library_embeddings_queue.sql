---------------------------------------------------------------------
-- [task queue - `grida_library_object_worker_jobs`] --
---------------------------------------------------------------------
select from pgmq.create('grida_library_object_worker_jobs');
alter table pgmq.q_grida_library_object_worker_jobs enable row level security;
grant select on table pgmq.a_grida_library_object_worker_jobs to pg_monitor;
grant select on table pgmq.q_grida_library_object_worker_jobs to pg_monitor;
grant delete, insert, references, select, trigger, truncate, update on table pgmq.a_grida_library_object_worker_jobs to service_role;
grant delete, insert, references, select, trigger, truncate, update on table pgmq.q_grida_library_object_worker_jobs to service_role;


---------------------------------------------------------------------
-- [enqueue_object_embedding_job] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enqueue_object_embedding_job()
RETURNS trigger AS $$
BEGIN
  PERFORM pgmq.send(
    queue_name := 'grida_library_object_worker_jobs',
    msg := json_build_object(
      'object_id', NEW.id,
      'path', NEW.path,
      'mimetype', NEW.mimetype
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER enqueue_object_embedding_on_insert AFTER INSERT ON grida_library.object FOR EACH ROW EXECUTE FUNCTION enqueue_object_embedding_job();



---------------------------------------------------------------------
-- [Embedding - Vision Support - amazon.titan-embed-image-v1] --
---------------------------------------------------------------------
create table grida_library.object_embedding (
  object_id uuid primary key references grida_library.object(id) on delete cascade,
  embedding vector(1024),
  created_at timestamptz default now()
);

CREATE INDEX object_embedding_ivfflat_idx ON grida_library.object_embedding USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);
ALTER TABLE grida_library.object_embedding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON grida_library.object_embedding FOR SELECT TO public USING (true);



---------------------------------------------------------------------
-- [similar rpc] --
---------------------------------------------------------------------
create or replace function grida_library.similar(
  ref_id uuid
)
returns setof grida_library.object
as $$
  with reference as (
    select embedding
    from grida_library.object_embedding
    where object_id = ref_id
  )
  select o.*
  from grida_library.object o
  join grida_library.object_embedding e on e.object_id = o.id,
       reference r
  where o.id <> ref_id and e.embedding is not null
  order by e.embedding <#> r.embedding;
$$ LANGUAGE plpgsql STABLE;