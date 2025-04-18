-- empty table - safe to run.
drop table if exists user_project_access_state;



---------------------------------------------------------------------
-- [project access state] --
---------------------------------------------------------------------
create table public.user_project_access_state (
    user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
    project_id bigint null references project(id) on delete set null,
    document_id uuid null references document(id) on delete set null,
    updated_at timestamp with time zone not null default now()
) TABLESPACE pg_default;

ALTER TABLE public.user_project_access_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all based on user_id" ON public.user_project_access_state USING ((user_id = auth.uid())) WITH CHECK (user_id = auth.uid());



---------------------------------------------------------------------
-- [RPC] mark_access --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workspace_mark_access(
  p_organization_name text,
  p_project_name text,
  p_document_id uuid DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  resolved_project_id bigint;
BEGIN
  SELECT p.id INTO resolved_project_id
  FROM public.project p
  JOIN public.organization o ON o.id = p.organization_id
  WHERE o.name = p_organization_name
    AND p.name = p_project_name
    AND public.rls_project(p.id)
  LIMIT 1;

  IF resolved_project_id IS NULL THEN
    RAISE EXCEPTION 'Project not found or access denied for %/%', p_organization_name, p_project_name;
  END IF;

  INSERT INTO public.user_project_access_state (user_id, project_id, document_id, updated_at)
  VALUES (auth.uid(), resolved_project_id, p_document_id, now())
  ON CONFLICT (user_id) DO UPDATE
  SET project_id = EXCLUDED.project_id,
      document_id = EXCLUDED.document_id,
      updated_at = now();
END;
$$ LANGUAGE plpgsql STABLE;



---------------------------------------------------------------------
-- [RPC] workspace_entry --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workspace_entry()
RETURNS TABLE (
  organization_id bigint,
  project_id bigint,
  document_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id AS organization_id,
    p.id AS project_id,
    upas.document_id
  FROM public.user_project_access_state upas
  JOIN public.project p ON p.id = upas.project_id
  JOIN public.organization o ON o.id = p.organization_id
  WHERE upas.user_id = auth.uid()
    AND public.rls_project(p.id)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;