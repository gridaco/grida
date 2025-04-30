---------------------------------------------------------------------
-- [slug type] --
---------------------------------------------------------------------
CREATE DOMAIN public.slug AS TEXT
CHECK (
  length(VALUE) >= 8 AND
  length(VALUE) <= 256 AND
  VALUE ~ '^[a-z0-9]+$'
);

---------------------------------------------------------------------
-- [generate random slug] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gen_random_slug()
RETURNS VARCHAR AS $$
BEGIN
  RETURN substr(md5(gen_random_uuid()::text), 1, 8);
END;
$$ LANGUAGE plpgsql;
