---------------------------------------------------------------------
-- [random rpc] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_library.random(p_limit INT DEFAULT 1)
RETURNS SETOF grida_library.object
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM (
    SELECT o.*
    FROM grida_library.object o
    ORDER BY random()
    LIMIT p_limit
  ) sub;
END;
$$ LANGUAGE plpgsql STABLE;