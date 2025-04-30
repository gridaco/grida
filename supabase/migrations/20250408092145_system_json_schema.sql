CREATE SCHEMA IF NOT EXISTS _grida;
GRANT USAGE ON SCHEMA _grida TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA _grida TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA _grida TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [system json schema] --
---------------------------------------------------------------------
CREATE TABLE _grida.sys_json_schema (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9_-]+$'),
    schema JSONB NOT NULL
);
-- Allow read to everyone
GRANT SELECT ON _grida.sys_json_schema TO anon, authenticated, service_role;
ALTER TABLE _grida.sys_json_schema ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_read_for_all" ON _grida.sys_json_schema FOR SELECT USING (true);


---------------------------------------------------------------------
-- [get system schema] --
---------------------------------------------------------------------
CREATE FUNCTION _grida.get_sys_json_schema(id TEXT)
RETURNS JSONB
AS $$ SELECT schema FROM _grida.sys_json_schema WHERE _grida.sys_json_schema.id = $1 $$
LANGUAGE sql STABLE;
