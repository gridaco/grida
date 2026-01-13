-- grida_forms migration: add `challenge_email` field type.

ALTER TYPE grida_forms.form_field_type ADD VALUE 'challenge_email';

ALTER TABLE grida_forms.response_field
  ADD COLUMN IF NOT EXISTS challenge_state jsonb;