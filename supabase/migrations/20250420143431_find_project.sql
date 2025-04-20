---------------------------------------------------------------------
-- [RPC] find project --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_project(
  p_org_ref text,
  p_proj_ref text
)
RETURNS SETOF public.project AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM public.project p
  JOIN public.organization o ON o.id = p.organization_id
  WHERE (o.id::text = p_org_ref OR o.name = p_org_ref)
  AND (p.id::text = p_proj_ref OR p.name = p_proj_ref);
END;
$$ LANGUAGE plpgsql STABLE;