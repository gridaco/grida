-- Create grida_ciam and grida_ciam_public schemas
-- grida_ciam: physical tables and internal functions
-- grida_ciam_public: public-facing views and RPC functions

CREATE SCHEMA IF NOT EXISTS grida_ciam;
ALTER SCHEMA grida_ciam OWNER TO postgres;

CREATE SCHEMA IF NOT EXISTS grida_ciam_public;
ALTER SCHEMA grida_ciam_public OWNER TO postgres;

-- Grant usage on grida_ciam schema
GRANT USAGE ON SCHEMA grida_ciam TO anon, authenticated, service_role;

-- Grant usage on grida_ciam_public schema (public-facing)
GRANT USAGE ON SCHEMA grida_ciam_public TO anon, authenticated, service_role;

-- Default privileges for grida_ciam schema
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam GRANT ALL ON ROUTINES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam GRANT ALL ON SEQUENCES TO service_role;

-- Default privileges for grida_ciam_public schema
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam_public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam_public GRANT ALL ON ROUTINES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_ciam_public GRANT ALL ON SEQUENCES TO service_role;
