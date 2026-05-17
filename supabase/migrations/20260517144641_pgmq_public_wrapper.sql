-- pgmq_public: PostgREST-facing wrapper schema for pgmq queues.
--
-- config.toml [api].schemas exposes "pgmq_public" to PostgREST. On the hosted
-- project the Studio "Expose Queues via PostgREST" toggle creates this schema;
-- locally it is never auto-created, so without this migration PostgREST fails
-- its schema-cache load with `schema "pgmq_public" does not exist` and the
-- local stack never comes up.
--
-- This mirrors what the Supabase dashboard generates (Supabase discussions
-- #41729 / #32969) so local == prod. Grants are service_role-only: the sole
-- consumer (jobs/src/main.ts) uses the service-role key, and supabase/AGENTS.md
-- requires deny-by-default for anon/authenticated.
--
-- Idempotent (`if not exists` / `or replace`) and forward-only: safe on the
-- hosted project where these objects already exist.

create schema if not exists pgmq_public;

grant usage on schema pgmq_public to service_role;
grant usage on schema pgmq to service_role;

create or replace function pgmq_public.pop(queue_name text)
returns setof pgmq.message_record
language plpgsql
set search_path = ''
as $$
begin
    return query select * from pgmq.pop(queue_name := queue_name);
end;
$$;
comment on function pgmq_public.pop(queue_name text) is
'Retrieves and locks the next message from the specified queue.';

create or replace function pgmq_public.send(queue_name text, message jsonb, sleep_seconds integer default 0)
returns setof bigint
language plpgsql
set search_path = ''
as $$
begin
    return query select * from pgmq.send(queue_name := queue_name, msg := message, delay := sleep_seconds);
end;
$$;
comment on function pgmq_public.send(queue_name text, message jsonb, sleep_seconds integer) is
'Sends a message to the specified queue, optionally delaying its availability by a number of seconds.';

create or replace function pgmq_public.read(queue_name text, sleep_seconds integer, n integer)
returns setof pgmq.message_record
language plpgsql
set search_path = ''
as $$
begin
    return query select * from pgmq.read(queue_name := queue_name, vt := sleep_seconds, qty := n);
end;
$$;
comment on function pgmq_public.read(queue_name text, sleep_seconds integer, n integer) is
'Reads up to "n" messages from the specified queue with an optional "sleep_seconds" (visibility timeout).';

create or replace function pgmq_public.archive(queue_name text, message_id bigint)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
    return pgmq.archive(queue_name := queue_name, msg_id := message_id);
end;
$$;
comment on function pgmq_public.archive(queue_name text, message_id bigint) is
'Archives a message by moving it from the queue to a permanent archive.';

create or replace function pgmq_public.delete(queue_name text, message_id bigint)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
    return pgmq.delete(queue_name := queue_name, msg_id := message_id);
end;
$$;
comment on function pgmq_public.delete(queue_name text, message_id bigint) is
'Permanently deletes a message from the specified queue.';

grant execute on function
    pgmq_public.pop(text),
    pgmq_public.send(text, jsonb, integer),
    pgmq_public.read(text, integer, integer),
    pgmq_public.archive(text, bigint),
    pgmq_public.delete(text, bigint)
to service_role;

grant all privileges on all tables in schema pgmq to service_role;
alter default privileges in schema pgmq grant all privileges on tables to service_role;
grant usage, select, update on all sequences in schema pgmq to service_role;
alter default privileges in schema pgmq grant usage, select, update on sequences to service_role;
