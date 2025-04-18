-- [www name type] --
---------------------------------------------------------------------
CREATE DOMAIN grida_www.www_name AS TEXT
CHECK (
  length(VALUE) <= 32 AND
  VALUE ~ '^[a-zA-Z0-9][a-zA-Z0-9\-]*$'
);

---------------------------------------------------------------------
-- [gen_random_www_name] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_www.gen_random_www_name(p_project_id INTEGER)
RETURNS TEXT AS $$
DECLARE
    org_name TEXT;
    project_name TEXT;
    suffix TEXT := encode(gen_random_bytes(2), 'hex');
BEGIN
    SELECT o.name, p.name INTO org_name, project_name
    FROM public.project p
    JOIN public.organization o ON o.id = p.organization_id
    WHERE p.id = p_project_id;

    RETURN lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '', 'g')) || '-' ||
           lower(regexp_replace(project_name, '[^a-zA-Z0-9]+', '', 'g')) || '-' || suffix;
END;
$$ LANGUAGE plpgsql STABLE;

---------------------------------------------------------------------
-- [Assign random www name trigger] --
---------------------------------------------------------------------
CREATE FUNCTION grida_www.assign_random_www_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.name := grida_www.gen_random_www_name(NEW.project_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;



---------------------------------------------------------------------
-- [Alter name column to use grida_www.www_name domain] --
---------------------------------------------------------------------

DROP VIEW IF EXISTS grida_www.www_public;
DROP VIEW IF EXISTS grida_www.public_route;

-- alter the column to use the new domain
ALTER TABLE grida_www.www ALTER COLUMN name TYPE grida_www.www_name USING name::TEXT;

-- add the trigger
CREATE TRIGGER set_www_name BEFORE INSERT ON grida_www.www FOR EACH ROW WHEN (NEW.name IS NULL) EXECUTE FUNCTION grida_www.assign_random_www_name();

-- recreate the view
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

CREATE VIEW grida_www.public_route AS
SELECT
  l.id,
  l.www_id,
  w.name AS www_name,
  'layout' AS type,
  l.document_id,
  l.document_type,
  l.parent_layout_id,
  (COALESCE(l.base_path, '') || '/' || l.name)::TEXT AS route_path,
  l.template_id,
  l.metadata
FROM grida_www.layout l
JOIN grida_www.www w ON w.id = l.www_id;

---------------------------------------------------------------------
-- [Check WWW Name] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_www.check_www_name_available(p_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM grida_www.www_public WHERE name = p_name
  ) AND p_name ~ '^[a-zA-Z0-9][a-zA-Z0-9\-]{2,32}$';
END;
$$ LANGUAGE plpgsql STABLE;


---------------------------------------------------------------------
-- [Claim WWW Name] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_www.change_www_name(p_www_id UUID, p_name TEXT)
RETURNS VOID AS $$
BEGIN
  -- 1. Validate ownership
  IF NOT grida_www.rls_www(p_www_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- 2. Validate name
  IF NOT grida_www.check_www_name_available(p_name) THEN
    RAISE EXCEPTION 'Name not available or invalid';
  END IF;

  -- 3. Apply
  UPDATE grida_www.www
  SET name = p_name
  WHERE id = p_www_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;