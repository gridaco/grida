-- grida_ciam schema
-- Physical tables and internal functions

CREATE SCHEMA IF NOT EXISTS grida_ciam;
ALTER SCHEMA grida_ciam OWNER TO postgres;

GRANT USAGE ON SCHEMA grida_ciam TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam GRANT ALL ON ROUTINES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam GRANT ALL ON SEQUENCES TO service_role;

-- grida_ciam_public schema
-- Public-facing views and RPC functions

CREATE SCHEMA IF NOT EXISTS grida_ciam_public;
ALTER SCHEMA grida_ciam_public OWNER TO postgres;

GRANT USAGE ON SCHEMA grida_ciam_public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam_public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam_public GRANT ALL ON ROUTINES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam_public GRANT ALL ON SEQUENCES TO service_role;

---------------------------------------------------------------------
-- [grida_ciam.customer_auth_policy]
---------------------------------------------------------------------

CREATE TABLE grida_ciam.customer_auth_policy (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    project_id bigint NOT NULL,
    challenges jsonb[] NOT NULL,
    description text,
    name text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    scopes text[] NOT NULL,
    CONSTRAINT customer_auth_policy_pkey PRIMARY KEY (id),
    CONSTRAINT customer_auth_policy_challenges_check CHECK (public.jsonb_array_objects_only(challenges)),
    CONSTRAINT customer_auth_policy_scopes_check CHECK (array_length(scopes, 1) > 0),
    CONSTRAINT customer_auth_policy_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX customer_auth_policy_pkey ON grida_ciam.customer_auth_policy USING btree (id);

ALTER TABLE grida_ciam.customer_auth_policy ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE grida_ciam.customer_auth_policy TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam.customer_tag]
---------------------------------------------------------------------

CREATE TABLE grida_ciam.customer_tag (
    customer_uid uuid NOT NULL,
    project_id bigint NOT NULL,
    tag_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT customer_tag_pkey PRIMARY KEY (customer_uid, project_id, tag_name),
    CONSTRAINT customer_tag_customer_uid_fkey FOREIGN KEY (customer_uid) REFERENCES public.customer(uid) ON DELETE CASCADE,
    CONSTRAINT customer_tag_project_id_tag_name_fkey FOREIGN KEY (project_id, tag_name) REFERENCES public.tag(project_id, name) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX customer_tag_pkey ON grida_ciam.customer_tag USING btree (customer_uid, project_id, tag_name);
CREATE INDEX idx_customer_tag_project_tag_name ON grida_ciam.customer_tag USING btree (project_id, tag_name);

ALTER TABLE grida_ciam.customer_tag ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_tag_rls_policy ON grida_ciam.customer_tag
USING (public.rls_project(project_id));

GRANT ALL ON TABLE grida_ciam.customer_tag TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam.insert_customer_with_tags]
-- Internal trigger function
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_ciam.insert_customer_with_tags()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  inserted_uid uuid;
  inserted_project_id bigint;
  tag text;
BEGIN
  INSERT INTO public.customer (project_id, uuid, email, name, phone, description, metadata)
  VALUES (NEW.project_id, NEW.uuid, NEW.email, NEW.name, NEW.phone, NEW.description, NEW.metadata)
  RETURNING uid, project_id INTO inserted_uid, inserted_project_id;

  IF NEW.tags IS NOT NULL THEN
    FOREACH tag IN ARRAY NEW.tags LOOP
      INSERT INTO public.tag (project_id, name)
      VALUES (inserted_project_id, tag)
      ON CONFLICT (project_id, name) DO NOTHING;

      INSERT INTO grida_ciam.customer_tag (customer_uid, project_id, tag_name)
      VALUES (inserted_uid, inserted_project_id, tag)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION grida_ciam.insert_customer_with_tags() TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.customer_with_tags]
-- Public-facing view
---------------------------------------------------------------------

CREATE VIEW grida_ciam_public.customer_with_tags
WITH (security_invoker = true)
AS
SELECT
  c.created_at,
  c.uid,
  c.user_id,
  c.email,
  c.project_id,
  c._fp_fingerprintjs_visitorid,
  c.last_seen_at,
  c.uuid,
  c.phone,
  c.is_email_verified,
  c.is_phone_verified,
  c.visitor_id,
  c.email_provisional,
  c.phone_provisional,
  c.name_provisional,
  c.name,
  c.description,
  c.metadata,
  c.is_marketing_email_subscribed,
  c.is_marketing_sms_subscribed,
  array_remove(array_agg(ct.tag_name), NULL) AS tags,
  c.search_tsv,
  (c.search_text || ' ' || COALESCE(string_agg(ct.tag_name, ' '), '')) AS search_text
FROM public.customer c
LEFT JOIN grida_ciam.customer_tag ct ON c.uid = ct.customer_uid
GROUP BY c.uid;

GRANT ALL ON TABLE grida_ciam_public.customer_with_tags TO anon, authenticated, service_role;

CREATE TRIGGER insert_customer_with_tags_instead
INSTEAD OF INSERT ON grida_ciam_public.customer_with_tags
FOR EACH ROW
EXECUTE FUNCTION grida_ciam.insert_customer_with_tags();

---------------------------------------------------------------------
-- [grida_ciam_public.update_customer_tags]
-- Public-facing RPC function
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_ciam_public.update_customer_tags(p_customer_uid uuid, p_project_id bigint, p_tags text[])
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  tag text;
BEGIN
  -- Delete existing tag associations for the customer in the given project
  DELETE FROM grida_ciam.customer_tag
  WHERE customer_uid = p_customer_uid AND project_id = p_project_id;

  -- Loop through each tag in the provided array
  FOREACH tag IN ARRAY p_tags LOOP
    -- Insert the tag into the tag table if it doesn't exist
    INSERT INTO public.tag (project_id, name)
    VALUES (p_project_id, tag)
    ON CONFLICT (project_id, name) DO NOTHING;
    
    -- Insert the new association in the customer_tag table
    INSERT INTO grida_ciam.customer_tag (customer_uid, project_id, tag_name)
    VALUES (p_customer_uid, p_project_id, tag)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION grida_ciam_public.update_customer_tags(uuid, bigint, text[]) TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.customer_auth_policy]
-- Public-facing view exposing customer_auth_policy table
---------------------------------------------------------------------

CREATE VIEW grida_ciam_public.customer_auth_policy
WITH (security_invoker = true)
AS
SELECT
  id,
  created_at,
  project_id,
  challenges,
  description,
  name,
  enabled,
  scopes
FROM grida_ciam.customer_auth_policy;

GRANT ALL ON TABLE grida_ciam_public.customer_auth_policy TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.customer_tag]
-- Public-facing view exposing customer_tag table (for FK relationships)
---------------------------------------------------------------------

CREATE VIEW grida_ciam_public.customer_tag
WITH (security_invoker = true)
AS
SELECT
  customer_uid,
  project_id,
  tag_name,
  created_at
FROM grida_ciam.customer_tag;

GRANT ALL ON TABLE grida_ciam_public.customer_tag TO anon, authenticated, service_role;
