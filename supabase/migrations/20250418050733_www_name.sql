
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