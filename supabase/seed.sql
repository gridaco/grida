-- !!!                                                                                           !!!
-- !!!            DO NOT EVER ACCIDENTALLY RUN THIS FILE IN YOUR PRODUCTION DATABASE             !!!
-- !!!    this is meant for running locally to seed your database for contributing purposes      !!!

-- #region local user
-- create local users (insiders)
-- insiders@grida.co / password



-- #region local user
-- create local users (insiders)

CREATE OR REPLACE FUNCTION public.tmp_seed_create_user(user_email text, user_password text)
RETURNS uuid AS $$
DECLARE
  new_user_id uuid := uuid_generate_v4();
BEGIN
  INSERT INTO auth.users ( instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) 
  VALUES 
    ('00000000-0000-0000-0000-000000000000', uuid_generate_v4(), 'authenticated', 'authenticated', user_email, crypt(user_password, gen_salt('bf')), current_timestamp, current_timestamp, current_timestamp, '{"provider":"email","providers":["email"]}', '{}', current_timestamp, current_timestamp, '', '', '', '');


  -- test user email identity
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES 
    (uuid_generate_v4(), (SELECT id FROM auth.users WHERE email = user_email), format('{"sub":"%s","email":"%s"}', (SELECT id FROM auth.users WHERE email = user_email)::text, user_email)::jsonb, 'email', uuid_generate_v4(), current_timestamp, current_timestamp, current_timestamp);


  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql;


-- must be wrapped in do block (https://github.com/supabase/cli/issues/882#issuecomment-1595725535)
do $$
begin
    -- insiders@grida.co / password (default - organization owner)
    perform public.tmp_seed_create_user('insiders@grida.co', 'password');
    -- outsiders@grida.co / password
    perform public.tmp_seed_create_user('outsiders@grida.co', 'password');
end$$;


DROP FUNCTION public.tmp_seed_create_user(text, text);
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