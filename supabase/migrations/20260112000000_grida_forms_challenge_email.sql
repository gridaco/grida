-- grida_forms migration: add `challenge_email` field type.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'grida_forms'
      AND t.typname = 'form_field_type'
      AND e.enumlabel = 'challenge_email'
  ) THEN
    ALTER TYPE grida_forms.form_field_type ADD VALUE 'challenge_email';
  END IF;
END $$;

ALTER TABLE grida_forms.response_field
  ADD COLUMN IF NOT EXISTS challenge_state jsonb;