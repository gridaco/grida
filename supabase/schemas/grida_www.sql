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
-- [Project WWW] --
---------------------------------------------------------------------
CREATE TABLE grida_www.www (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name grida_www.www_name UNIQUE NOT NULL,
    project_id INTEGER UNIQUE NOT NULL REFERENCES public.project(id) ON DELETE CASCADE,
    title TEXT,
    description TEXT,
    keywords TEXT[],
    lang TEXT DEFAULT 'en' NOT NULL,
    publisher TEXT,
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

CREATE TRIGGER set_www_name BEFORE INSERT ON grida_www.www FOR EACH ROW WHEN (NEW.name IS NULL) EXECUTE FUNCTION grida_www.assign_random_www_name();

ALTER TABLE grida_www.www ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_based_on_project_membership" ON grida_www.www USING (public.rls_project(project_id)) WITH CHECK (public.rls_project(project_id));

---------------------------------------------------------------------
-- [Custom Domains] -- hostname -> www mapping
---------------------------------------------------------------------
CREATE TABLE grida_www.domain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  www_id UUID NOT NULL REFERENCES grida_www.www(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,

  -- pending: user declared / awaiting DNS; active: usable in routing; error: last provider error
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error')),

  -- exactly one canonical hostname per tenant (enforced by partial unique index)
  canonical BOOLEAN NOT NULL DEFAULT false,

  -- derived: apex vs subdomain
  kind TEXT GENERATED ALWAYS AS (
    CASE
      WHEN array_length(string_to_array(hostname, '.'), 1) = 2 THEN 'apex'
      ELSE 'subdomain'
    END
  ) STORED,

  vercel JSONB,
  -- last time we attempted to sync/verify the domain with the provider
  last_checked_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  -- stable internal classification for last_error
  last_error_code TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX grida_www_domain_hostname_lower_uniq
ON grida_www.domain ((lower(hostname)));

CREATE UNIQUE INDEX grida_www_domain_canonical_per_www_uniq
ON grida_www.domain (www_id)
WHERE canonical AND status = 'active';

CREATE TRIGGER handle_updated_at
BEFORE UPDATE ON grida_www.domain
FOR EACH ROW
EXECUTE FUNCTION extensions.moddatetime('updated_at');

ALTER TABLE grida_www.domain ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_based_on_www_editor" ON grida_www.domain USING (grida_www.rls_www(www_id)) WITH CHECK (grida_www.rls_www(www_id));

-- Harden against public enumeration.
-- Domain mapping is identity; listing mappings should remain tenant-scoped.
DROP POLICY IF EXISTS public_read_active ON grida_www.domain;

CREATE OR REPLACE FUNCTION public.www_resolve_hostname(p_hostname TEXT)
RETURNS TABLE (
  www_id UUID,
  www_name TEXT,
  canonical_hostname TEXT
) AS $$
  WITH requested AS (
    SELECT d.www_id
    FROM grida_www.domain d
    WHERE lower(d.hostname) = lower(p_hostname)
      AND d.status = 'active'
    LIMIT 1
  ),
  canon AS (
    SELECT d2.hostname AS canonical_hostname
    FROM grida_www.domain d2
    JOIN requested r ON r.www_id = d2.www_id
    WHERE d2.status = 'active'
      AND d2.canonical = true
    LIMIT 1
  )
  SELECT w.id, w.name, (SELECT canonical_hostname FROM canon)
  FROM requested r
  JOIN grida_www.www w ON w.id = r.www_id;
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION public.www_resolve_hostname(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.www_resolve_hostname(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.www_resolve_hostname(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.www_resolve_hostname(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.www_get_canonical_hostname(p_www_name TEXT)
RETURNS TABLE (
  canonical_hostname TEXT
) AS $$
  SELECT d.hostname AS canonical_hostname
  FROM grida_www.domain d
  JOIN grida_www.www w ON w.id = d.www_id
  WHERE lower(w.name) = lower(p_www_name)
    AND d.status = 'active'
    AND d.canonical = true
  LIMIT 1;
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION public.www_get_canonical_hostname(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.www_get_canonical_hostname(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.www_get_canonical_hostname(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.www_get_canonical_hostname(TEXT) TO service_role;


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
-- [Template] -- “template” = A renderable, versionable structure of layout + content.
---------------------------------------------------------------------
CREATE TABLE grida_www.template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  www_id UUID NOT NULL REFERENCES grida_www.www(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_draft BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE grida_www.template ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_based_on_www_editor" ON grida_www.template USING (grida_www.rls_www(www_id)) WITH CHECK (grida_www.rls_www(www_id));
CREATE POLICY "public_read_if_public" ON grida_www.template FOR SELECT TO public USING (is_public = true);


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
    metadata JSONB,
    template_id UUID NOT NULL REFERENCES grida_www.template(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(www_id, base_path, name),

    CONSTRAINT layout_id_document_id_key UNIQUE (id, document_id),
    CONSTRAINT fk_layout_document FOREIGN KEY (document_id, document_type) REFERENCES public.document(id, doctype) ON DELETE CASCADE
);
ALTER TABLE grida_www.layout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_based_on_www_editor" ON grida_www.layout USING (grida_www.rls_www(www_id)) WITH CHECK (grida_www.rls_www(www_id));


---------------------------------------------------------------------
-- [Public Routing Table] --
---------------------------------------------------------------------
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
$$ LANGUAGE plpgsql VOLATILE;