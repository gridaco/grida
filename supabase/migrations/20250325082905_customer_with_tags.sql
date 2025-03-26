-- Domain definition for hex color validation
CREATE DOMAIN public.color_hex AS TEXT
  CHECK (VALUE ~ '^#[0-9a-f]{6}$');

-- Table: public.tag
-- Stores tags associated at the project level with optional descriptions and colors
CREATE TABLE public.tag (
    id SERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (
      char_length(trim(name)) > 0 
      AND char_length(name) <= 100 
      AND name NOT LIKE '%,%'
    ),
    color public.color_hex NOT NULL DEFAULT '#ffffff',
    description TEXT NULL CHECK (description IS NULL OR char_length(description) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);

-- Enable Row Level Security (RLS) on tag table
ALTER TABLE public.tag ENABLE ROW LEVEL SECURITY;

-- RLS Policy to restrict access based on project ownership
CREATE POLICY tag_rls_policy ON public.tag
USING (public.rls_project(project_id));

-- Table: public.customer_tag
-- Associative table linking customers with tags by name within a specific project context
CREATE TABLE public.customer_tag (
    customer_uid UUID NOT NULL REFERENCES customer(uid) ON DELETE CASCADE,
    project_id BIGINT NOT NULL, -- composite key for project scope
    tag_name TEXT NOT NULL, -- external reference to tag name
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_uid, project_id, tag_name),
    FOREIGN KEY (project_id, tag_name) 
      REFERENCES public.tag(project_id, name) 
      ON UPDATE CASCADE -- ensures tag renames cascade correctly
      ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_tag_project_tag_name ON public.customer_tag (project_id, tag_name);

-- Enable Row Level Security (RLS) on customer_tag table
ALTER TABLE public.customer_tag ENABLE ROW LEVEL SECURITY;

-- RLS Policy to restrict access based on project ownership
CREATE POLICY customer_tag_rls_policy ON public.customer_tag
USING (public.rls_project(project_id));

-- View: public.customer_with_tags
-- Facilitates bulk insertion and retrieval of customers along with their tags
CREATE VIEW public.customer_with_tags 
WITH (security_invoker = true)
AS
SELECT
  c.*,
  array_remove(array_agg(ct.tag_name), NULL) AS tags
FROM public.customer c
LEFT JOIN public.customer_tag ct ON c.uid = ct.customer_uid
GROUP BY c.uid;

-- Trigger Function: public.insert_customer_with_tags
-- Handles bulk insertions of customers and their tags via the customer_with_tags view
CREATE FUNCTION public.insert_customer_with_tags()
RETURNS TRIGGER AS $$
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

      INSERT INTO public.customer_tag (customer_uid, project_id, tag_name)
      VALUES (inserted_uid, inserted_project_id, tag)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to use the insert_customer_with_tags function on insert operations to the view
CREATE TRIGGER insert_customer_with_tags_instead
INSTEAD OF INSERT ON public.customer_with_tags
FOR EACH ROW
EXECUTE FUNCTION public.insert_customer_with_tags();

-- rpc function for update (synchronize) customer tags
CREATE OR REPLACE FUNCTION public.update_customer_tags(
  p_customer_uid uuid,
  p_project_id bigint,
  p_tags text[]
)
RETURNS void AS $$
BEGIN
  -- Delete existing tag associations for the customer in the given project
  DELETE FROM public.customer_tag
  WHERE customer_uid = p_customer_uid AND project_id = p_project_id;

  -- Loop through each tag in the provided array
  FOREACH tag IN ARRAY p_tags LOOP
    -- Insert the tag into the tag table if it doesn't exist
    INSERT INTO public.tag (project_id, name)
    VALUES (p_project_id, tag)
    ON CONFLICT (project_id, name) DO NOTHING;
    
    -- Insert the new association in the customer_tag table
    INSERT INTO public.customer_tag (customer_uid, project_id, tag_name)
    VALUES (p_customer_uid, p_project_id, tag)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;