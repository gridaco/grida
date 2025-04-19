
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