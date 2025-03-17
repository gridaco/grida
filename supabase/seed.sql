-- !!!                                                                                           !!!
-- !!!            DO NOT EVER ACCIDENTALLY RUN THIS FILE IN YOUR PRODUCTION DATABASE             !!!
-- !!!    this is meant for running locally to seed your database for contributing purposes      !!!

-- #region local user
-- create local users (insiders)
-- insiders@grida.co / password
INSERT INTO auth.users ( instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) 
VALUES 
  ('00000000-0000-0000-0000-000000000000', uuid_generate_v4(), 'authenticated', 'authenticated', 'insiders@grida.co', crypt('password', gen_salt('bf')), current_timestamp, current_timestamp, current_timestamp, '{"provider":"email","providers":["email"]}', '{}', current_timestamp, current_timestamp, '', '', '', '');


-- test user email identity
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES 
  (uuid_generate_v4(), (SELECT id FROM auth.users WHERE email = 'insiders@grida.co'), format('{"sub":"%s","email":"%s"}', (SELECT id FROM auth.users WHERE email = 'insiders@grida.co')::text, 'insiders@grida.co')::jsonb, 'email', uuid_generate_v4(), current_timestamp, current_timestamp, current_timestamp);

-- #endregion local user


-- #region organization
-- create organizations
INSERT INTO public.organization (
  name,
  owner_id,
  avatar_path,
  email,
  description,
  blog,
  display_name,
  display_plan
)
VALUES (
  'local',
  (SELECT id FROM auth.users WHERE email = 'insiders@grida.co'),
  NULL,
  'hello@grida.co',
  'Local test organization for development purposes.',
  'https://grida.co',
  'Local',
  'free'
);
-- #endregion organization


-- #region project
-- create project
INSERT INTO public.project (
  organization_id,
  name
)
VALUES (
  (SELECT id FROM public.organization WHERE name = 'local'),
  'dev'
);
-- #endregion project