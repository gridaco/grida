CREATE SCHEMA IF NOT EXISTS grida_www;
ALTER SCHEMA grida_www OWNER TO "postgres";

GRANT USAGE ON SCHEMA grida_www TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA grida_www TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA grida_www TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA grida_www TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_www GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_www GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_www GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;


---------------------------------------------------------------------
-- [Route Path Type] --
-- starts with '/', does NOT end with '/'
-- e.g. '/docs', '/r/[slug]', '/store/products'
---------------------------------------------------------------------
CREATE DOMAIN grida_www.base_path AS TEXT
CHECK (
  VALUE ~ '^/([a-zA-Z0-9\-_]+)(/[a-zA-Z0-9\-_]+)*$'
);

-- does NOT start with '/', does NOT end with '/'
-- e.g. 'a', 'a/b/c', 'guide/[id]/steps'
CREATE DOMAIN grida_www.sub_path AS TEXT
CHECK (
  VALUE ~ '^([a-zA-Z0-9\-_]+)(/[a-zA-Z0-9\-_]+)*$'
);


---------------------------------------------------------------------
-- [Project WWW] --
---------------------------------------------------------------------
CREATE TABLE grida_www.www (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name public.slug UNIQUE NOT NULL DEFAULT public.gen_random_slug(),
    project_id INTEGER UNIQUE NOT NULL REFERENCES public.project(id) ON DELETE CASCADE,
    title TEXT,
    description TEXT,
    keywords TEXT[],
    lang TEXT DEFAULT 'en' NOT NULL,
    favicon JSONB,
    CHECK (
        jsonb_matches_schema(
            _grida.get_sys_json_schema('favicon')::json,
            favicon
        )
    ),
    og_image TEXT,
    theme JSONB
);

ALTER TABLE grida_www.www ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_based_on_project_membership" ON grida_www.www USING (public.rls_project(project_id)) WITH CHECK (public.rls_project(project_id));


---------------------------------------------------------------------
-- [rls_www] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_www.rls_www(p_www_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM grida_www.www w
        WHERE w.id = p_www_id
          AND public.rls_project(w.project_id)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


---------------------------------------------------------------------
-- [Project WWW (Public)] --
---------------------------------------------------------------------
CREATE VIEW grida_www.www_public AS
SELECT
  id,
  name,
  title,
  description,
  keywords,
  lang,
  favicon,
  og_image
FROM grida_www.www;


---------------------------------------------------------------------
-- [Migration: Seed public.www for existing public.project rows] --
---------------------------------------------------------------------
INSERT INTO grida_www.www (project_id, title)
SELECT
  p.id,
  p.name
FROM public.project p
WHERE NOT EXISTS (
  SELECT 1 FROM grida_www.www s WHERE s.project_id = p.id
);


---------------------------------------------------------------------
-- [trigger insert_www_for_new_project] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_www_for_new_project()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO grida_www.www (project_id, title)
  VALUES (NEW.id, NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- [trigger] insert_www_for_new_project
CREATE TRIGGER trg_insert_site_for_project AFTER INSERT ON public.project FOR EACH ROW EXECUTE FUNCTION public.insert_www_for_new_project();


---------------------------------------------------------------------
-- [www layout] --
---------------------------------------------------------------------
CREATE TABLE grida_www.layout (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_layout_id UUID REFERENCES grida_www.layout(id) ON DELETE SET NULL,
    www_id UUID NOT NULL REFERENCES grida_www.www(id) ON DELETE CASCADE,
    base_path grida_www.base_path NULL, -- e.g. '/docs'
    name grida_www.sub_path NOT NULL, -- e.g. '[slug]', 'guides', etc
    document_id UUID NOT NULL,
    document_type public.doctype NOT NULL,
    path_tokens TEXT[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    template JSONB,
    metadata JSONB,
    version TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(www_id, base_path, name),

    CONSTRAINT layout_id_document_id_key UNIQUE (id, document_id),
    CONSTRAINT fk_layout_document FOREIGN KEY (document_id, document_type) REFERENCES public.document(id, doctype) ON DELETE CASCADE
);
ALTER TABLE grida_www.layout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_based_on_www_editor" ON grida_www.layout USING (grida_www.rls_www(www_id)) WITH CHECK (grida_www.rls_www(www_id));

---------------------------------------------------------------------
-- [www page] --
---------------------------------------------------------------------
CREATE TABLE grida_www.page (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    www_id UUID NOT NULL REFERENCES grida_www.www(id) ON DELETE CASCADE,
    layout_id UUID NULL REFERENCES grida_www.layout(id) ON DELETE CASCADE,
    name grida_www.sub_path NOT NULL, -- e.g. '[slug]', 'guides', etc
    document_id UUID NOT NULL,
    document_type public.doctype NOT NULL,
    path_tokens TEXT[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    body JSONB NOT NULL,
    metadata JSONB,
    version TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(www_id, layout_id, name),

    CONSTRAINT page_id_document_id_key UNIQUE (id, document_id),
    CONSTRAINT fk_page_document FOREIGN KEY (document_id, document_type) REFERENCES public.document(id, doctype) ON DELETE CASCADE
);
ALTER TABLE grida_www.page ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_based_on_www_editor" ON grida_www.page USING (grida_www.rls_www(www_id)) WITH CHECK (grida_www.rls_www(www_id));

---------------------------------------------------------------------
-- [Routing Table] --
---------------------------------------------------------------------
CREATE VIEW grida_www.routing_table_public AS
SELECT
  l.id,
  l.www_id,
  w.name AS www_name,
  'layout' AS type,
  l.document_id,
  l.document_type,
  l.parent_layout_id AS layout_id,
  (COALESCE(l.base_path, '') || '/' || l.name)::TEXT AS route_path,
  l.version,
  l.metadata
FROM grida_www.layout l
JOIN grida_www.www w ON w.id = l.www_id

  UNION ALL

SELECT
  p.id,
  p.www_id,
  w.name AS www_name,
  'page' AS type,
  p.document_id,
  p.document_type,
  p.layout_id,
  (
    COALESCE(
      (SELECT base_path FROM grida_www.layout l2 WHERE l2.id = p.layout_id),
      ''
    ) || '/' || p.name
  )::TEXT AS route_path,
  p.version,
  p.metadata
FROM grida_www.page p
JOIN grida_www.www w ON w.id = p.www_id;


---------------------------------------------------------------------
-- [WWW Bucket Policy] --
---------------------------------------------------------------------
create policy "Allow project authenticated upserts"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'www' and
  grida_www.rls_www((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'www' and
  grida_www.rls_www((storage.foldername(name))[1]::uuid)
);
