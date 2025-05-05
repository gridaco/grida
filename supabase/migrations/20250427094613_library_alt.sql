---------------------------------------------------------------
-- migrate grida_library.object
---------------------------------------------------------------

-- 1. alt text for accessibility
ALTER TABLE grida_library.object
ADD COLUMN alt TEXT;

-- 2. description no longer mandatory
ALTER TABLE grida_library.object
ALTER COLUMN description DROP NOT NULL;

-- 3. color can be null (e.g. SVG with currentColor / transparent)
ALTER TABLE grida_library.object
ALTER COLUMN color DROP NOT NULL;

-- 4. system-generated annotation tracker
ALTER TABLE grida_library.object
ADD COLUMN sys_annotations TEXT[] NOT NULL DEFAULT '{}';