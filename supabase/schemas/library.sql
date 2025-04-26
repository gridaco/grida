CREATE SCHEMA IF NOT EXISTS grida_library;
ALTER SCHEMA grida_library OWNER TO "postgres";

GRANT USAGE ON SCHEMA grida_library TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA grida_library TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA grida_library TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA grida_library TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_library GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_library GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_library GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;


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
-- [Object] --
---------------------------------------------------------------------
CREATE TABLE grida_library.object (
  id UUID PRIMARY KEY REFERENCES storage.objects(id) ON DELETE CASCADE,
  path TEXT NOT NULL UNIQUE,
  path_tokens TEXT[] GENERATED ALWAYS AS (string_to_array(path, '/'::text)) STORED,
  title TEXT,
  description TEXT NOT NULL,
  author_id UUID REFERENCES grida_library.author(id) ON DELETE SET NULL,
  category grida_library.label NOT NULL,
  categories grida_library.label[] NOT NULL DEFAULT '{}',
  objects TEXT[] NOT NULL DEFAULT '{}',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  mimetype TEXT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  bytes INT NOT NULL,
  license TEXT NOT NULL DEFAULT 'CC0-1.0',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  fill TEXT,
  color grida_library.color NOT NULL,
  colors grida_library.color[] NOT NULL DEFAULT '{}',
  background grida_library.color NULL,
  score NUMERIC CHECK (score >= 0 AND score <= 1),
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE grida_library.object ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON grida_library.object FOR SELECT TO public USING (true);


---------------------------------------------------------------------
-- [Search support] --
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
