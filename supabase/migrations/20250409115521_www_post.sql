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
