-- grida_forms: respondent email notification settings
--
-- Adds a per-form `notification_respondent_email` JSONB config column.
-- This migration is intentionally clean (no legacy cleanup) because it was not shipped.

ALTER TABLE grida_forms.form
  ADD COLUMN IF NOT EXISTS notification_respondent_email jsonb NOT NULL DEFAULT '{}'::jsonb;

-- JSON schema guard (requires `pg_jsonschema` extension; installed under schema `extensions`).
ALTER TABLE grida_forms.form
  DROP CONSTRAINT IF EXISTS form_notification_respondent_email_schema_check;

ALTER TABLE grida_forms.form
  ADD CONSTRAINT form_notification_respondent_email_schema_check
  CHECK (
    extensions.jsonb_matches_schema(
      '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "enabled": { "type": "boolean" },
          "from_name": { "type": ["string", "null"] },
          "subject_template": { "type": ["string", "null"] },
          "body_html_template": { "type": ["string", "null"] },
          "reply_to": { "type": ["string", "null"] }
        }
      }'::json,
      notification_respondent_email
    )
  );

