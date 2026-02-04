-- grida_forms: respondent email notification settings
--
-- Adds a per-form `notification_respondent_email` JSONB config column.

ALTER TABLE grida_forms.form
  DROP CONSTRAINT IF EXISTS form_notification_respondent_email_to_attribute_id_fkey,
  DROP COLUMN IF EXISTS notification_respondent_email_enabled,
  DROP COLUMN IF EXISTS notification_respondent_email_to_attribute_id,
  DROP COLUMN IF EXISTS notification_respondent_email_subject_template,
  DROP COLUMN IF EXISTS notification_respondent_email_body_html_template,
  DROP COLUMN IF EXISTS notification_respondent_email_reply_to,
  ADD COLUMN IF NOT EXISTS notification_respondent_email jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP INDEX IF EXISTS grida_forms_form_notification_respondent_email_to_attribute_id_idx;

