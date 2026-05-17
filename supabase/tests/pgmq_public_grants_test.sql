-- pgTAP suite: pgmq_public wrapper schema grants
--
-- Proves the deny-by-default boundary created by
-- migrations/20260517144641_pgmq_public_wrapper.sql:
--   - the schema + the five wrapper functions exist (so PostgREST can
--     introspect "pgmq_public" declared in config.toml [api].schemas),
--   - service_role can use the schema and execute the functions
--     (the jobs/src/main.ts poller uses the service-role key),
--   - anon / authenticated have NO USAGE on the schema.
--
-- The security gate is schema-level USAGE, not function EXECUTE: Postgres
-- grants EXECUTE to PUBLIC by default, but without USAGE on pgmq_public a
-- role cannot resolve or call anything inside it. That matches the
-- canonical Supabase pattern this migration mirrors.

BEGIN;

SELECT plan(11);

-- ---------------------------------------------------------------------
-- 1. Schema + function existence (PostgREST schema-cache surface).
-- ---------------------------------------------------------------------

SELECT has_schema('pgmq_public', 'pgmq_public schema exists');

SELECT has_function('pgmq_public', 'pop',
  ARRAY['text'], 'pgmq_public.pop(text) exists');
SELECT has_function('pgmq_public', 'send',
  ARRAY['text', 'jsonb', 'integer'], 'pgmq_public.send(text,jsonb,integer) exists');
SELECT has_function('pgmq_public', 'read',
  ARRAY['text', 'integer', 'integer'], 'pgmq_public.read(text,integer,integer) exists');
SELECT has_function('pgmq_public', 'archive',
  ARRAY['text', 'bigint'], 'pgmq_public.archive(text,bigint) exists');
SELECT has_function('pgmq_public', 'delete',
  ARRAY['text', 'bigint'], 'pgmq_public.delete(text,bigint) exists');

-- ---------------------------------------------------------------------
-- 2. service_role can use the schema + execute the poller's functions.
-- ---------------------------------------------------------------------

SELECT ok(
  has_schema_privilege('service_role', 'pgmq_public', 'USAGE'),
  'service_role has USAGE on pgmq_public'
);
SELECT ok(
  has_function_privilege('service_role', 'pgmq_public.read(text,integer,integer)', 'EXECUTE'),
  'service_role can EXECUTE pgmq_public.read'
);
SELECT ok(
  has_function_privilege('service_role', 'pgmq_public.archive(text,bigint)', 'EXECUTE'),
  'service_role can EXECUTE pgmq_public.archive'
);

-- ---------------------------------------------------------------------
-- 3. Deny-by-default: anon / authenticated cannot reach the schema.
-- ---------------------------------------------------------------------

SELECT ok(
  NOT has_schema_privilege('anon', 'pgmq_public', 'USAGE'),
  'anon has no USAGE on pgmq_public'
);
SELECT ok(
  NOT has_schema_privilege('authenticated', 'pgmq_public', 'USAGE'),
  'authenticated has no USAGE on pgmq_public'
);

SELECT * FROM finish();
ROLLBACK;
