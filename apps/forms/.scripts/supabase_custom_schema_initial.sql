GRANT USAGE ON SCHEMA grida_forms TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA grida_forms TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA grida_forms TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA grida_forms TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_forms GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_forms GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_forms GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
