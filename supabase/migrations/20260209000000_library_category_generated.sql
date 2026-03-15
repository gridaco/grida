-- Ensure the 'generated' category exists for AI-generated images.
-- This is safe to run on any environment: ON CONFLICT DO NOTHING
-- makes it a no-op if the row already exists.
INSERT INTO grida_library.category (id, name)
VALUES ('generated', 'Generated')
ON CONFLICT (id) DO NOTHING;
