CREATE SCHEMA IF NOT EXISTS grida_www;
ALTER SCHEMA grida_www OWNER TO "postgres";

GRANT USAGE ON SCHEMA grida_www TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA grida_www TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA grida_www TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA grida_www TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_www GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_www GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_www GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;



-- seed struct
INSERT INTO _grida.sys_json_schema (id, schema)
VALUES (
    'favicon',
    '{
      "type": "object",
      "required": ["src"],
      "properties": {
        "src": { "type": "string", "minLength": 1 },
        "srcDark": { "type": "string", "minLength": 1 }
      },
      "additionalProperties": false
    }'::jsonb
);

---------------------------------------------------------------------
-- [Project WWW] --
---------------------------------------------------------------------
CREATE TABLE grida_www.project_www (
    id public.slug PRIMARY KEY DEFAULT public.gen_random_slug(),
    project_id INTEGER UNIQUE REFERENCES public.project(id) ON DELETE CASCADE,
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

ALTER TABLE grida_www.project_www ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_based_on_project_membership" ON grida_www.project_www USING (public.rls_project(project_id)) WITH CHECK (public.rls_project(project_id));



---------------------------------------------------------------------
-- [Project WWW (Public)] --
---------------------------------------------------------------------
CREATE VIEW grida_www.project_www_public AS
SELECT
  id,
  title,
  description,
  keywords,
  lang,
  favicon,
  og_image
FROM grida_www.project_www;


---------------------------------------------------------------------
-- [Migration: Seed public.project_www for existing public.project rows] --
---------------------------------------------------------------------
INSERT INTO grida_www.project_www (project_id, title)
SELECT
  p.id,
  p.name
FROM public.project p
WHERE NOT EXISTS (
  SELECT 1 FROM grida_www.project_www s WHERE s.project_id = p.id
);


---------------------------------------------------------------------
-- [trigger insert_www_for_new_project] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_www_for_new_project()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO grida_www.project_www (project_id, title)
  VALUES (NEW.id, NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- [trigger] insert_www_for_new_project
CREATE TRIGGER trg_insert_site_for_project AFTER INSERT ON public.project FOR EACH ROW EXECUTE FUNCTION public.insert_www_for_new_project();


---------------------------------------------------------------------
-- [WWW Bucket Policy] --
---------------------------------------------------------------------
create policy "Allow project authenticated uploads"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'www' and
  public.rls_project((storage.foldername(name))[1]::int)
)
with check (
  bucket_id = 'www' and
  public.rls_project((storage.foldername(name))[1]::int)
);
