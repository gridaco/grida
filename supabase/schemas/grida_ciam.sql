-- grida_ciam schema
-- Physical tables and internal functions

-- Ensure pgcrypto extension is available for hashing functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

---------------------------------------------------------------------
-- [grida_ciam.one_time_token_type]
-- Enum type for OTP challenge token types
---------------------------------------------------------------------

CREATE TYPE grida_ciam.one_time_token_type AS ENUM ('confirmation_token');

---------------------------------------------------------------------
-- [grida_ciam.customer_otp_challenge]
-- Stores OTP challenges for customer email verification
---------------------------------------------------------------------

CREATE TABLE grida_ciam.customer_otp_challenge (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    
    project_id bigint NOT NULL,
    email text NOT NULL,
    customer_uid uuid NULL REFERENCES public.customer(uid) ON DELETE CASCADE,
    
    token_type grida_ciam.one_time_token_type NOT NULL DEFAULT 'confirmation_token',
    otp_salt bytea NOT NULL,
    otp_hash bytea NOT NULL,
    attempt_count int NOT NULL DEFAULT 0,
    
    CONSTRAINT customer_otp_challenge_pkey PRIMARY KEY (id)
);

CREATE INDEX customer_otp_challenge_lookup ON grida_ciam.customer_otp_challenge (project_id, email, created_at DESC);

ALTER TABLE grida_ciam.customer_otp_challenge ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE grida_ciam.customer_otp_challenge TO service_role;

---------------------------------------------------------------------
-- [grida_ciam.make_url_token]
-- URL-safe base64 token generator (no padding)
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_ciam.make_url_token(n_bytes int DEFAULT 48)
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = extensions, pg_temp
AS $$
  SELECT regexp_replace(
           translate(encode(gen_random_bytes(n_bytes), 'base64'), '+/', '-_'),
           '=+$',
           ''
         );
$$;

REVOKE ALL ON FUNCTION grida_ciam.make_url_token(int) FROM public;
GRANT EXECUTE ON FUNCTION grida_ciam.make_url_token(int) TO service_role;

---------------------------------------------------------------------
-- [grida_ciam.customer_portal_session]
-- Stores URL-based bearer sessions for customer portal access
---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS grida_ciam.customer_portal_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  project_id bigint NOT NULL,
  customer_uid uuid NOT NULL REFERENCES public.customer(uid) ON DELETE CASCADE,

  -- Store only sha256(token); never store the raw token
  token_hash bytea NOT NULL,

  -- Phase A: must be opened before this time or it expires unused
  activate_expires_at timestamptz NOT NULL,

  -- Phase B: sliding idle timeout after activation
  activated_at timestamptz,
  last_seen_at timestamptz,

  -- TTL knobs stored per-row
  activation_ttl_seconds int NOT NULL DEFAULT 300,
  idle_ttl_seconds int NOT NULL DEFAULT 3600,

  revoked_at timestamptz,

  scopes text[] NOT NULL DEFAULT ARRAY['portal']::text[]
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_portal_session_token_hash_uq
  ON grida_ciam.customer_portal_session (token_hash);

CREATE INDEX IF NOT EXISTS customer_portal_session_customer_idx
  ON grida_ciam.customer_portal_session (project_id, customer_uid);

ALTER TABLE grida_ciam.customer_portal_session ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE grida_ciam.customer_portal_session TO service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.create_customer_otp_challenge]
-- Public-facing RPC to create an OTP challenge
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_ciam_public.create_customer_otp_challenge(
    p_project_id bigint,
    p_email text,
    p_otp text,
    p_expires_in_seconds int DEFAULT 600
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
    v_customer_uid uuid;
    v_challenge_id uuid;
    v_salt bytea;
    v_hash bytea;
BEGIN
    -- Look up customer by project_id and email (optional, may be null to prevent enumeration)
    SELECT uid INTO v_customer_uid
    FROM public.customer
    WHERE project_id = p_project_id
      AND email = p_email
    ORDER BY uid
    LIMIT 1;

    -- Generate salt and hash the OTP
    v_salt := gen_random_bytes(16);
    v_hash := digest(v_salt || convert_to(p_otp, 'utf8'), 'sha256');

    -- Insert challenge
    INSERT INTO grida_ciam.customer_otp_challenge (
        project_id,
        email,
        customer_uid,
        token_type,
        otp_salt,
        otp_hash,
        expires_at
    )
    VALUES (
        p_project_id,
        p_email,
        v_customer_uid,
        'confirmation_token',
        v_salt,
        v_hash,
        now() + make_interval(secs => p_expires_in_seconds)
    )
    RETURNING id INTO v_challenge_id;

    RETURN v_challenge_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION grida_ciam_public.create_customer_otp_challenge(bigint, text, text, int) TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.verify_customer_otp_and_create_session]
-- Public-facing RPC to verify OTP (no session creation)
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_ciam_public.verify_customer_otp_and_create_session(
    p_challenge_id uuid,
    p_otp text,
    p_session_ttl_seconds int DEFAULT 2592000
)
RETURNS TABLE (
    customer_uid uuid,
    project_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
    c grida_ciam.customer_otp_challenge%ROWTYPE;
    v_hash bytea;
    v_customer_uid uuid;
    v_project_id bigint;
BEGIN
    -- Lock and fetch challenge row
    SELECT * INTO c
    FROM grida_ciam.customer_otp_challenge
    WHERE id = p_challenge_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid';
    END IF;

    -- Validate challenge state
    IF c.consumed_at IS NOT NULL OR c.expires_at <= now() THEN
        RAISE EXCEPTION 'invalid';
    END IF;

    IF c.attempt_count >= 8 THEN
        RAISE EXCEPTION 'invalid';
    END IF;

    -- Verify token type
    IF c.token_type != 'confirmation_token' THEN
        RAISE EXCEPTION 'invalid';
    END IF;

    -- Hash OTP with stored salt
    v_hash := digest(c.otp_salt || convert_to(p_otp, 'utf8'), 'sha256');

    -- Verify hash and customer_uid
    IF v_hash != c.otp_hash OR c.customer_uid IS NULL THEN
        UPDATE grida_ciam.customer_otp_challenge
        SET attempt_count = attempt_count + 1
        WHERE id = c.id;
        
        RAISE EXCEPTION 'invalid';
    END IF;

    -- Mark challenge as consumed
    UPDATE grida_ciam.customer_otp_challenge
    SET consumed_at = now()
    WHERE id = c.id;

    -- Update customer: set email verified and update email
    UPDATE public.customer
    SET is_email_verified = true,
        email = c.email
    WHERE public.customer.uid = c.customer_uid
      AND public.customer.project_id = c.project_id;

    -- Return customer scope for downstream portal session minting
    v_customer_uid := c.customer_uid;
    v_project_id := c.project_id;

    RETURN QUERY SELECT v_customer_uid, v_project_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION grida_ciam_public.verify_customer_otp_and_create_session(uuid, text, int) TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.create_customer_portal_session]
-- Service-role RPC to create portal session and return the raw token ONCE
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_ciam_public.create_customer_portal_session(
  p_project_id bigint,
  p_customer_uid uuid,
  p_activation_ttl_seconds int DEFAULT 300,
  p_idle_ttl_seconds int DEFAULT 3600,
  p_scopes text[] DEFAULT ARRAY['portal']::text[]
)
RETURNS TABLE (
  token text,
  activate_expires_at timestamptz,
  activation_ttl_seconds int,
  idle_ttl_seconds int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_token text;
  v_hash bytea;
  v_activate_expires timestamptz;
  v_activation_ttl int;
  v_idle_ttl int;
BEGIN
  v_activation_ttl := GREATEST(1, p_activation_ttl_seconds);
  v_idle_ttl := GREATEST(1, p_idle_ttl_seconds);

  v_token := grida_ciam.make_url_token(48);
  v_hash := digest(convert_to(v_token, 'utf8'), 'sha256');

  v_activate_expires := now() + make_interval(secs => v_activation_ttl);

  INSERT INTO grida_ciam.customer_portal_session (
    project_id,
    customer_uid,
    token_hash,
    activate_expires_at,
    activation_ttl_seconds,
    idle_ttl_seconds,
    scopes
  )
  VALUES (
    p_project_id,
    p_customer_uid,
    v_hash,
    v_activate_expires,
    v_activation_ttl,
    v_idle_ttl,
    COALESCE(p_scopes, ARRAY['portal']::text[])
  );

  RETURN QUERY SELECT v_token, v_activate_expires, v_activation_ttl, v_idle_ttl;
END;
$function$;

GRANT EXECUTE ON FUNCTION grida_ciam_public.create_customer_portal_session(
  bigint, uuid, int, int, text[]
) TO service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.redeem_customer_portal_session]
-- Public-facing RPC to redeem (activate) a portal session and optionally touch it
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_ciam_public.redeem_customer_portal_session(
  p_token text,
  p_touch boolean DEFAULT true
)
RETURNS TABLE (
  session_id uuid,
  project_id bigint,
  customer_uid uuid,
  scopes text[],
  activated_at timestamptz,
  last_seen_at timestamptz,
  idle_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_hash bytea;
  s grida_ciam.customer_portal_session%ROWTYPE;
  v_now timestamptz := now();
  v_idle_expires timestamptz;
BEGIN
  v_hash := digest(convert_to(p_token, 'utf8'), 'sha256');

  SELECT * INTO s
  FROM grida_ciam.customer_portal_session
  WHERE token_hash = v_hash
    AND revoked_at IS NULL
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF s.activated_at IS NULL THEN
    IF s.activate_expires_at <= v_now THEN
      RETURN;
    END IF;

    UPDATE grida_ciam.customer_portal_session
    SET activated_at = v_now,
        last_seen_at = v_now
    WHERE id = s.id
    RETURNING * INTO s;
  ELSE
    v_idle_expires := s.last_seen_at + make_interval(secs => s.idle_ttl_seconds);
    IF v_idle_expires <= v_now THEN
      RETURN;
    END IF;

    IF p_touch THEN
      UPDATE grida_ciam.customer_portal_session
      SET last_seen_at = v_now
      WHERE id = s.id
      RETURNING * INTO s;
    END IF;
  END IF;

  v_idle_expires := s.last_seen_at + make_interval(secs => s.idle_ttl_seconds);

  RETURN QUERY
  SELECT
    s.id,
    s.project_id,
    s.customer_uid,
    s.scopes,
    s.activated_at,
    s.last_seen_at,
    v_idle_expires;
END;
$function$;

GRANT EXECUTE ON FUNCTION grida_ciam_public.redeem_customer_portal_session(text, boolean)
TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.touch_customer_portal_session]
-- Public-facing RPC to refresh last_seen_at with debounce
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_ciam_public.touch_customer_portal_session(
  p_token text,
  p_min_seconds_between_touches int DEFAULT 60
)
RETURNS TABLE (
  session_id uuid,
  last_seen_at timestamptz,
  idle_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_hash bytea;
  s grida_ciam.customer_portal_session%ROWTYPE;
  v_now timestamptz := now();
  v_idle_expires timestamptz;
  v_min int := GREATEST(0, p_min_seconds_between_touches);
BEGIN
  v_hash := digest(convert_to(p_token, 'utf8'), 'sha256');

  SELECT * INTO s
  FROM grida_ciam.customer_portal_session
  WHERE token_hash = v_hash
    AND revoked_at IS NULL
    AND activated_at IS NOT NULL
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_idle_expires := s.last_seen_at + make_interval(secs => s.idle_ttl_seconds);
  IF v_idle_expires <= v_now THEN
    RETURN;
  END IF;

  IF s.last_seen_at + make_interval(secs => v_min) > v_now THEN
    RETURN QUERY SELECT s.id, s.last_seen_at, v_idle_expires;
    RETURN;
  END IF;

  UPDATE grida_ciam.customer_portal_session
  SET last_seen_at = v_now
  WHERE id = s.id
  RETURNING * INTO s;

  v_idle_expires := s.last_seen_at + make_interval(secs => s.idle_ttl_seconds);

  RETURN QUERY SELECT s.id, s.last_seen_at, v_idle_expires;
END;
$function$;

GRANT EXECUTE ON FUNCTION grida_ciam_public.touch_customer_portal_session(text, int)
TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.revoke_customer_portal_sessions]
-- Service-role RPC to revoke all portal sessions for a customer
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_ciam_public.revoke_customer_portal_sessions(
  p_project_id bigint,
  p_customer_uid uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  UPDATE grida_ciam.customer_portal_session
  SET revoked_at = now()
  WHERE project_id = p_project_id
    AND customer_uid = p_customer_uid
    AND revoked_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION grida_ciam_public.revoke_customer_portal_sessions(bigint, uuid)
TO service_role;

---------------------------------------------------------------------
-- [grida_ciam.portal_preset]
-- Per-project portal presets (multiple allowed, one primary).
-- Stores admin-authored verification email template and login page text as JSONB.
---------------------------------------------------------------------

CREATE TABLE grida_ciam.portal_preset (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    project_id bigint NOT NULL REFERENCES public.project(id) ON DELETE CASCADE,
    name text NOT NULL,
    is_primary boolean NOT NULL DEFAULT false,
    verification_email_template jsonb NOT NULL DEFAULT '{}'::jsonb,
    portal_login_page jsonb NOT NULL DEFAULT '{"template_id":"202602-default"}'::jsonb
);

ALTER TABLE grida_ciam.portal_preset
  ADD CONSTRAINT portal_preset_verification_email_template_check
  CHECK (
    extensions.jsonb_matches_schema(
      '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "enabled":            { "type": "boolean" },
          "from_name":          { "type": ["string", "null"] },
          "subject_template":   { "type": ["string", "null"] },
          "body_html_template": { "type": ["string", "null"] },
          "reply_to":           { "type": ["string", "null"] }
        }
      }'::json,
      verification_email_template
    )
  );

ALTER TABLE grida_ciam.portal_preset
  ADD CONSTRAINT portal_preset_portal_login_page_check
  CHECK (
    extensions.jsonb_matches_schema(
      '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "additionalProperties": false,
        "required": ["template_id"],
        "properties": {
          "template_id":             { "const": "202602-default" },
          "email_step_title":        { "type": ["string", "null"] },
          "email_step_description":  { "type": ["string", "null"] },
          "email_step_button_label": { "type": ["string", "null"] },
          "otp_step_title":          { "type": ["string", "null"] },
          "otp_step_description":    { "type": ["string", "null"] }
        }
      }'::json,
      portal_login_page
    )
  );

CREATE UNIQUE INDEX portal_preset_primary_per_project
  ON grida_ciam.portal_preset (project_id)
  WHERE (is_primary = true);

CREATE INDEX portal_preset_project_idx
  ON grida_ciam.portal_preset (project_id);

CREATE OR REPLACE FUNCTION grida_ciam.set_portal_preset_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_portal_preset_updated_at
  BEFORE UPDATE ON grida_ciam.portal_preset
  FOR EACH ROW
  EXECUTE FUNCTION grida_ciam.set_portal_preset_updated_at();

ALTER TABLE grida_ciam.portal_preset ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_based_on_project_membership"
  ON grida_ciam.portal_preset
  USING  (public.rls_project(project_id))
  WITH CHECK (public.rls_project(project_id));

GRANT ALL ON TABLE grida_ciam.portal_preset TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.portal_preset]
-- Public-facing view
---------------------------------------------------------------------

CREATE VIEW grida_ciam_public.portal_preset
WITH (security_invoker = true)
AS
SELECT
  id,
  created_at,
  updated_at,
  project_id,
  name,
  is_primary,
  verification_email_template,
  portal_login_page
FROM grida_ciam.portal_preset;

GRANT ALL ON TABLE grida_ciam_public.portal_preset TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.set_primary_portal_preset]
-- Atomically sets one preset as primary for a project.
---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grida_ciam_public.set_primary_portal_preset(
  p_project_id bigint,
  p_preset_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  IF NOT public.rls_project(p_project_id) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM grida_ciam.portal_preset
    WHERE id = p_preset_id AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'preset not found';
  END IF;

  UPDATE grida_ciam.portal_preset
  SET is_primary = false
  WHERE project_id = p_project_id AND is_primary = true;

  UPDATE grida_ciam.portal_preset
  SET is_primary = true
  WHERE id = p_preset_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION grida_ciam_public.set_primary_portal_preset(bigint, uuid)
  TO authenticated, service_role;
