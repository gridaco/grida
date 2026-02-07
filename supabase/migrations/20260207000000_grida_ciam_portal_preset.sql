-- grida_ciam: portal presets
--
-- Adds a per-project "portal preset" table so admins can create multiple
-- portal variants, pick one as primary, and customise the customer-portal
-- OTP verification email with admin-authored HTML (Handlebars).
-- Also stores optional login-page text overrides per preset.

---------------------------------------------------------------------
-- [grida_ciam.portal_preset]
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

-- JSON schema guard (mirrors grida_forms.form.notification_respondent_email shape).
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

-- JSON schema guard for portal login page text overrides.
-- The required "template_id" field acts as a version discriminator; future
-- schema revisions introduce a new template_id value + a new constraint,
-- making stale rows fail validation and forcing an explicit migration.
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

-- At most one primary preset per project.
CREATE UNIQUE INDEX portal_preset_primary_per_project
  ON grida_ciam.portal_preset (project_id)
  WHERE (is_primary = true);

-- Lookup index for the runtime hot-path (resolve primary by project).
CREATE INDEX portal_preset_project_idx
  ON grida_ciam.portal_preset (project_id);

---------------------------------------------------------------------
-- [updated_at trigger]
---------------------------------------------------------------------

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

---------------------------------------------------------------------
-- [RLS]
---------------------------------------------------------------------

ALTER TABLE grida_ciam.portal_preset ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_based_on_project_membership"
  ON grida_ciam.portal_preset
  USING  (public.rls_project(project_id))
  WITH CHECK (public.rls_project(project_id));

GRANT ALL ON TABLE grida_ciam.portal_preset TO anon, authenticated, service_role;

---------------------------------------------------------------------
-- [grida_ciam_public.portal_preset] (public-facing view)
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
  -- Enforce project membership (same check as RLS).
  IF NOT public.rls_project(p_project_id) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  -- Verify the preset belongs to the requested project.
  IF NOT EXISTS (
    SELECT 1 FROM grida_ciam.portal_preset
    WHERE id = p_preset_id AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'preset not found';
  END IF;

  -- Clear current primary (if any) and promote the chosen preset.
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
