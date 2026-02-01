-- RPC: delete project with fixed statement_timeout
-- Security: SECURITY INVOKER (RLS enforced exactly as direct DELETE)
--
-- Usage (PostgREST):
--   select public.delete_project(<project_id>);

create or replace function public.delete_project(
  p_project_id bigint
)
returns boolean
language sql
security invoker
set statement_timeout to '30s'
as $$
  with d as (
    delete from public.project
    where id = p_project_id
    returning 1
  )
  select exists (select 1 from d);
$$;

revoke all on function public.delete_project(bigint) from public;
grant execute on function public.delete_project(bigint) to authenticated, service_role;
