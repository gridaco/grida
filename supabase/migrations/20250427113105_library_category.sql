---------------------------------------------------------------------
-- [Category] --
---------------------------------------------------------------------
CREATE TABLE grida_library.category (
  id TEXT PRIMARY KEY,        -- e.g. 'wallpaper', 'illustration'
  name TEXT NOT NULL,          -- human-readable name
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);



---------------------------------------------------------------------
-- [migration] --
---------------------------------------------------------------------
-- Step 1: seed distinct categories
INSERT INTO grida_library.category (id, name)
SELECT DISTINCT category, initcap(category)
FROM grida_library.object
WHERE category IS NOT NULL
  AND category <> ''
ON CONFLICT (id) DO NOTHING;

-- Step 2: DROP search_tsv column first
ALTER TABLE grida_library.object
DROP COLUMN IF EXISTS search_tsv;

-- Step 3: remove old constraint
ALTER TABLE grida_library.object
  DROP CONSTRAINT IF EXISTS object_category_fkey;

-- Step 4: re-add correct FK
ALTER TABLE grida_library.object
ADD CONSTRAINT fk_object_category
FOREIGN KEY (category)
REFERENCES grida_library.category(id)
ON DELETE RESTRICT;

-- Step 5: Recreate search_tsv
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

CREATE INDEX IF NOT EXISTS object_search_idx ON grida_library.object USING GIN (search_tsv);