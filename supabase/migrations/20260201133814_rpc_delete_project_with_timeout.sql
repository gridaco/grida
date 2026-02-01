-- RPC: delete project with fixed statement_timeout
-- Security: SECURITY INVOKER (RLS enforced exactly as direct DELETE)
--
-- Usage (PostgREST):
--   select public.delete_project(<project_id>, 'DELETE <project_name>');

drop function if exists public.delete_project(bigint);

create or replace function public.delete_project(
  p_project_id bigint,
  p_confirm text
)
returns boolean
language sql
security invoker
set statement_timeout to '30s'
as $$
  with d as (
    delete from public.project p
    where p.id = p_project_id
      and p_confirm = ('DELETE ' || p.name)
    returning 1
  )
  select exists (select 1 from d);
$$;

revoke all on function public.delete_project(bigint, text) from public;
grant execute on function public.delete_project(bigint, text) to authenticated, service_role;
