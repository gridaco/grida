---------------------------------------------------------------------
-- [system json schema] --
---------------------------------------------------------------------
CREATE TABLE public.sys_json_schema (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9_-]+$'),
    schema JSONB NOT NULL
);

-- Allow read to everyone
ALTER TABLE public.sys_json_schema ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_read_for_all" ON public.sys_json_schema FOR SELECT USING (true);


---------------------------------------------------------------------
-- [get system schema] --
---------------------------------------------------------------------
CREATE FUNCTION public.get_sys_json_schema(id TEXT)
RETURNS JSONB
AS $$ SELECT schema FROM public.sys_json_schema WHERE public.sys_json_schema.id = $1 $$
LANGUAGE sql STABLE;
