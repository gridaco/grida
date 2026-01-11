-- Move customer artifacts to grida_ciam and grida_ciam_public schemas
-- grida_ciam: physical tables and internal functions
-- grida_ciam_public: public-facing views and RPC functions

-- Move tables to grida_ciam
ALTER TABLE public.customer_auth_policy SET SCHEMA grida_ciam;
ALTER TABLE public.customer_tag SET SCHEMA grida_ciam;

-- Move trigger function to grida_ciam (internal function)
ALTER FUNCTION public.insert_customer_with_tags() SET SCHEMA grida_ciam;

-- Move view to grida_ciam_public (public-facing view)
ALTER VIEW public.customer_with_tags SET SCHEMA grida_ciam_public;

-- Move RPC function to grida_ciam_public (public-facing RPC)
ALTER FUNCTION public.update_customer_tags(uuid, bigint, text[]) SET SCHEMA grida_ciam_public;

-- Update insert_customer_with_tags function body to reference grida_ciam.customer_tag
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

-- Update update_customer_tags function body to reference grida_ciam.customer_tag
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

-- Recreate view with schema-qualified references to grida_ciam.customer_tag
CREATE OR REPLACE VIEW grida_ciam_public.customer_with_tags
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

-- Re-bind trigger to use schema-qualified function
DROP TRIGGER IF EXISTS insert_customer_with_tags_instead ON grida_ciam_public.customer_with_tags;
CREATE TRIGGER insert_customer_with_tags_instead
INSTEAD OF INSERT ON grida_ciam_public.customer_with_tags
FOR EACH ROW
EXECUTE FUNCTION grida_ciam.insert_customer_with_tags();

---------------------------------------------------------------------
-- Public-facing views in grida_ciam_public
---------------------------------------------------------------------

-- View to expose customer_auth_policy from grida_ciam
CREATE OR REPLACE VIEW grida_ciam_public.customer_auth_policy
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

-- View to expose customer_tag from grida_ciam (for FK relationships)
CREATE OR REPLACE VIEW grida_ciam_public.customer_tag
WITH (security_invoker = true)
AS
SELECT
  customer_uid,
  project_id,
  tag_name,
  created_at
FROM grida_ciam.customer_tag;

GRANT ALL ON TABLE grida_ciam_public.customer_tag TO anon, authenticated, service_role;
