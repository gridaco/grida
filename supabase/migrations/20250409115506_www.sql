-- seed struct
INSERT INTO public.sys_json_schema (id, schema)
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
CREATE TABLE public.project_www (
    project_id INTEGER PRIMARY KEY REFERENCES public.project(id) ON DELETE CASCADE,
    title TEXT,
    description TEXT,
    keywords TEXT[],
    lang TEXT DEFAULT 'en' NOT NULL,
    favicon JSONB,
    CHECK (
        jsonb_matches_schema(
            get_sys_json_schema('favicon')::json,
            favicon
        )
    ),
    og_image TEXT,
    theme JSONB
);

ALTER TABLE public.project_www ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_based_on_project_membership" ON public.project_www USING (public.rls_project(project_id)) WITH CHECK (public.rls_project(project_id));


---------------------------------------------------------------------
-- [Migration: Seed public.project_www for existing public.project rows] --
---------------------------------------------------------------------
INSERT INTO public.project_www (project_id, title)
SELECT
  p.id,
  p.name
FROM public.project p
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_www s WHERE s.project_id = p.id
);


---------------------------------------------------------------------
-- [trigger insert_site_for_new_project] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_site_for_new_project()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.project_www (project_id, title)
  VALUES (NEW.id, NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- [trigger] insert_site_for_new_project
CREATE TRIGGER trg_insert_site_for_project AFTER INSERT ON public.project FOR EACH ROW EXECUTE FUNCTION public.insert_site_for_new_project();


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
