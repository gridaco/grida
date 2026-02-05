-- Custom domains for grida_www (hostname -> www tenant mapping)

CREATE TABLE IF NOT EXISTS grida_www.domain (
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

-- Case-insensitive uniqueness for hostname
CREATE UNIQUE INDEX IF NOT EXISTS grida_www_domain_hostname_lower_uniq
ON grida_www.domain ((lower(hostname)));

-- At most 1 canonical domain per www
CREATE UNIQUE INDEX IF NOT EXISTS grida_www_domain_canonical_per_www_uniq
ON grida_www.domain (www_id)
WHERE canonical AND status = 'active';

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS handle_updated_at ON grida_www.domain;
CREATE TRIGGER handle_updated_at
BEFORE UPDATE ON grida_www.domain
FOR EACH ROW
EXECUTE FUNCTION extensions.moddatetime('updated_at');

ALTER TABLE grida_www.domain ENABLE ROW LEVEL SECURITY;

-- Editors: manage domains for a www they can access.
DROP POLICY IF EXISTS access_based_on_www_editor ON grida_www.domain;
CREATE POLICY access_based_on_www_editor
ON grida_www.domain
USING (grida_www.rls_www(www_id))
WITH CHECK (grida_www.rls_www(www_id));

-- Harden against public enumeration.
-- Domain mapping is identity; listing mappings should remain tenant-scoped.
DROP POLICY IF EXISTS public_read_active ON grida_www.domain;

-- Resolve a hostname to a tenant (www) and its canonical hostname (if configured).
--
-- Public API surface:
-- - Exposed as `public.www_resolve_hostname` (per `supabase/AGENTS.md`)
-- - Executable only by `service_role`
--
-- Behavior:
-- - If `p_hostname` matches an active custom domain, returns that tenant.
-- - `canonical_hostname` is the active canonical custom hostname (or NULL if none).
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

-- Resolve a tenant name to its canonical custom hostname (if configured).
-- Returns NULL when the tenant has no canonical active custom domain.
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
