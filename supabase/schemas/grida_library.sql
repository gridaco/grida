CREATE SCHEMA IF NOT EXISTS grida_library;
ALTER SCHEMA grida_library OWNER TO "postgres";

GRANT USAGE ON SCHEMA grida_library TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA grida_library TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA grida_library TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA grida_library TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_library GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_library GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_library GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;


---------------------------------------------------------------------
-- [task queue - `grida_library_object_embedding_jobs`] --
---------------------------------------------------------------------
select from pgmq.create('grida_library_object_embedding_jobs');
alter table pgmq.q_grida_library_object_embedding_jobs enable row level security;
grant select on table pgmq.a_grida_library_object_embedding_jobs to pg_monitor;
grant select on table pgmq.q_grida_library_object_embedding_jobs to pg_monitor;
grant delete, insert, references, select, trigger, truncate, update on table pgmq.a_grida_library_object_embedding_jobs to service_role;
grant delete, insert, references, select, trigger, truncate, update on table pgmq.q_grida_library_object_embedding_jobs to service_role;


---------------------------------------------------------------------
-- [enqueue_object_embedding_job] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enqueue_object_embedding_job()
RETURNS trigger AS $$
BEGIN
  PERFORM pgmq.send(
    queue_name := 'grida_library_object_embedding_jobs',
    msg := json_build_object(
      'object_id', NEW.id,
      'path', NEW.path,
      'mimetype', NEW.mimetype
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE DOMAIN grida_library.color AS TEXT
  CHECK (VALUE ~ '^#[0-9a-f]{6}$');

CREATE DOMAIN grida_library.lang AS TEXT
  CHECK (VALUE ~ '^[a-z]{2}(-[A-Z]{2})?$');

---------------------------------------------------------------------
-- [label type (keyword)] --
---------------------------------------------------------------------
CREATE DOMAIN grida_library.label AS TEXT
CHECK (
  length(VALUE) >= 2 AND
  length(VALUE) <= 32 AND
  VALUE ~ '^[a-z0-9]+$'
);

CREATE TYPE grida_library.orientation AS ENUM ('portrait', 'landscape', 'square');



---------------------------------------------------------------------
-- [Author] --
---------------------------------------------------------------------
CREATE TABLE grida_library.author (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  provider TEXT,
  blog TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_provider_username UNIQUE (provider, username)
);

ALTER TABLE grida_library.author ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON grida_library.author FOR SELECT TO public USING (true);
REVOKE SELECT (user_id) ON TABLE grida_library.author FROM anon;
REVOKE SELECT (user_id) ON TABLE grida_library.author FROM authenticated;

---------------------------------------------------------------------
-- [Category] --
---------------------------------------------------------------------
CREATE TABLE grida_library.category (
  id TEXT PRIMARY KEY,        -- e.g. 'wallpaper', 'illustration'
  name TEXT NOT NULL,          -- human-readable name
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE grida_library.category ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON grida_library.category FOR SELECT TO public USING (true);

---------------------------------------------------------------------
-- [Object] --
---------------------------------------------------------------------
CREATE TABLE grida_library.object (
  id UUID PRIMARY KEY REFERENCES storage.objects(id) ON DELETE CASCADE,
  path TEXT NOT NULL UNIQUE,
  path_tokens TEXT[] GENERATED ALWAYS AS (string_to_array(path, '/'::text)) STORED,
  title TEXT,
  alt TEXT,
  description TEXT,
  author_id UUID REFERENCES grida_library.author(id) ON DELETE SET NULL,
  category TEXT NOT NULL REFERENCES grida_library.category(id) ON DELETE RESTRICT,
  categories grida_library.label[] NOT NULL DEFAULT '{}',
  objects TEXT[] NOT NULL DEFAULT '{}',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  mimetype TEXT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  bytes INT NOT NULL,
  license TEXT NOT NULL DEFAULT 'CC0-1.0',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  fill TEXT, -- e.g. currentColor / mixed
  color grida_library.color,
  colors grida_library.color[] NOT NULL DEFAULT '{}',
  background grida_library.color NULL,
  score NUMERIC CHECK (score >= 0 AND score <= 1),
  priority INT,
  year INT CHECK (year >= 1000 AND year <= 3000),
  entropy NUMERIC CHECK (entropy >= 0 AND entropy <= 1),
  orientation grida_library.orientation,
  gravity_x NUMERIC CHECK (gravity_x >= 0 AND gravity_x <= 1),
  gravity_y NUMERIC CHECK (gravity_y >= 0 AND gravity_y <= 1),
  lang grida_library.lang,
  generator TEXT,
  prompt TEXT,
  transparency BOOLEAN NOT NULL,
  public_domain BOOLEAN NOT NULL DEFAULT false,
  sys_annotations TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE grida_library.object ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON grida_library.object FOR SELECT TO public USING (true);
CREATE TRIGGER enqueue_object_embedding_on_insert AFTER INSERT ON grida_library.object FOR EACH ROW EXECUTE FUNCTION enqueue_object_embedding_job();

---------------------------------------------------------------------
-- [Text Search support] --
---------------------------------------------------------------------
ALTER TABLE grida_library.object
ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(description, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(year::text, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(category, '')), 'B') ||
  setweight(array_to_tsvector(categories), 'C') ||
  setweight(array_to_tsvector(keywords), 'C') ||
  setweight(to_tsvector('simple', coalesce(prompt, '')), 'C')
) STORED;

CREATE INDEX object_search_idx ON grida_library.object USING GIN (search_tsv);


---------------------------------------------------------------------
-- [[LEGACY] Embedding - Vision Support - clip-vit-large-patch14] --
---------------------------------------------------------------------
create table grida_library.object_embedding_clip_l14 (
  object_id uuid primary key references grida_library.object(id) on delete cascade,
  embedding vector(768),
  created_at timestamptz default now()
);

ALTER TABLE grida_library.object_embedding_clip_l14 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON grida_library.object_embedding_clip_l14 FOR SELECT TO public USING (true);

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
-- [Collection] --
---------------------------------------------------------------------
CREATE TABLE grida_library.collection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  author_id UUID REFERENCES grida_library.author(id) ON DELETE SET NULL,
  cover_object_id UUID REFERENCES grida_library.object(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE grida_library.collection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON grida_library.collection FOR SELECT TO public USING (true);


---------------------------------------------------------------------
-- [Collection Object] --
---------------------------------------------------------------------
CREATE TABLE grida_library.collection_object (
  object_id UUID REFERENCES grida_library.object(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES grida_library.collection(id) ON DELETE CASCADE,
  PRIMARY KEY (object_id, collection_id)
);

ALTER TABLE grida_library.collection_object ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON grida_library.collection_object FOR SELECT TO public USING (true);


---------------------------------------------------------------------
-- [random rpc] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_library.random(p_limit INT DEFAULT 1)
RETURNS SETOF grida_library.object
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM (
    SELECT o.*
    FROM grida_library.object o
    ORDER BY random()
    LIMIT p_limit
  ) sub;
END;
$$ LANGUAGE plpgsql STABLE;


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