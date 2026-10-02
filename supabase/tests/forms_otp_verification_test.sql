-- OTP counters survive denials; Forms success is one transaction. Fixtures use
-- the seeded local/acme projects and are entirely rolled back.
BEGIN;
SELECT plan(79);

CREATE TEMP TABLE otp_rpc (signature text PRIMARY KEY);
INSERT INTO otp_rpc VALUES
  ('grida_ciam_public.create_customer_otp_challenge(bigint, text, text, integer)'),
  ('grida_ciam_public.verify_customer_otp_and_create_session(uuid, text, integer)'),
  ('grida_forms.verify_email_otp(uuid, uuid, uuid, text)');
GRANT SELECT ON otp_rpc TO anon, authenticated, service_role;

SELECT set_eq(
  $$SELECT format('%s.%s(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE (n.nspname = 'grida_ciam_public' AND p.proname IN
            ('create_customer_otp_challenge', 'verify_customer_otp_and_create_session'))
        OR (n.nspname = 'grida_forms' AND p.proname = 'verify_email_otp')$$,
  $$SELECT signature FROM otp_rpc$$,
  'all OTP issuer/verifier overloads have an explicit role contract'
);
SELECT ok(NOT has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'),
          'anon denied ' || signature) FROM otp_rpc ORDER BY signature;
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'),
          'authenticated denied ' || signature) FROM otp_rpc ORDER BY signature;
SELECT ok(has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE'),
          'service allowed ' || signature) FROM otp_rpc ORDER BY signature;
SELECT ok(NOT EXISTS (
    SELECT 1 FROM pg_proc p,
    LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = to_regprocedure(signature)
      AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ), 'no PUBLIC execute on ' || signature) FROM otp_rpc ORDER BY signature;

CREATE TEMP TABLE otp_forms (tenant text PRIMARY KEY, project_id bigint,
  form_id uuid, identity_field uuid, other_field uuid, plain_field uuid);
CREATE TEMP TABLE otp_cases (label text PRIMARY KEY, session_id uuid, field_id uuid,
  challenge_id uuid, customer_uid uuid, project_id bigint, email text);
GRANT SELECT ON otp_forms, otp_cases TO anon, authenticated, service_role;

DO $$
DECLARE t record; r otp_forms%ROWTYPE;
BEGIN
  FOR t IN SELECT * FROM (VALUES ('local', 'dev'), ('acme', 'acme-project')) v(tenant, project)
  LOOP
    r.tenant := t.tenant;
    SELECT id INTO STRICT r.project_id FROM public.project WHERE name = t.project;
    INSERT INTO grida_forms.form (project_id, title)
      VALUES (r.project_id, 'OTP test ' || t.tenant) RETURNING id INTO r.form_id;
    INSERT INTO grida_forms.attribute (form_id, name, type)
      VALUES (r.form_id, '__gf_customer_email', 'challenge_email') RETURNING id INTO r.identity_field;
    INSERT INTO grida_forms.attribute (form_id, name, type)
      VALUES (r.form_id, 'contact', 'challenge_email') RETURNING id INTO r.other_field;
    INSERT INTO grida_forms.attribute (form_id, name, type)
      VALUES (r.form_id, 'text', 'text') RETURNING id INTO r.plain_field;
    INSERT INTO otp_forms VALUES (r.*);
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.otp_case(p_label text, p_other_field boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE f otp_forms%ROWTYPE; r otp_cases%ROWTYPE;
BEGIN
  SELECT * INTO f FROM otp_forms WHERE tenant = 'local';
  r.label := p_label;
  r.email := 'otp-' || p_label || '@example.com';
  r.project_id := f.project_id;
  r.field_id := CASE WHEN p_other_field THEN f.other_field ELSE f.identity_field END;
  INSERT INTO public.customer (project_id, email, is_email_verified)
    VALUES (f.project_id, r.email, false) RETURNING uid INTO r.customer_uid;
  r.challenge_id := grida_ciam_public.create_customer_otp_challenge(f.project_id, r.email, '123456', 600);
  INSERT INTO grida_forms.response_session (form_id, raw)
    VALUES (f.form_id, jsonb_build_object('untouched', 'draft',
      '__challenge_email__' || r.field_id::text, jsonb_build_object(
        'state', 'challenge-session-started', 'email', r.email,
        'challenge_id', r.challenge_id, 'expires_at', clock_timestamp() + interval '10 minutes',
        'verified_at', NULL, 'customer_uid', NULL))) RETURNING id INTO r.session_id;
  INSERT INTO otp_cases VALUES (r.*);
END $$;
SELECT pg_temp.otp_case(label, label = 'nonidentity') FROM unnest(ARRAY[
  'success', 'attempts', 'null', 'expired', 'scope', 'latest', 'missing',
  'foreignproject', 'emailmismatch', 'formwrong', 'formnull', 'nonidentity', 'rollback'
]) label;

-- Denied calls have real, valid arguments. Grants—not missing fixtures—deny them.
CREATE TEMP TABLE otp_calls (sql text);
INSERT INTO otp_calls
SELECT format('SELECT grida_ciam_public.create_customer_otp_challenge(%s,%L,%L,600)',
              project_id, 'role-call@example.com', '123456') FROM otp_cases WHERE label = 'success'
UNION ALL
SELECT format('SELECT * FROM grida_ciam_public.verify_customer_otp_and_create_session(%L,%L,0)',
              challenge_id, '123456') FROM otp_cases WHERE label = 'success'
UNION ALL
SELECT format('SELECT * FROM grida_forms.verify_email_otp(%L,%L,%L,%L)',
              session_id, field_id, challenge_id, '123456') FROM otp_cases WHERE label = 'success';
GRANT SELECT ON otp_calls TO anon, authenticated;
SET LOCAL ROLE anon;
SELECT throws_ok(sql, '42501', NULL, 'anonymous cannot invoke privileged OTP RPC') FROM otp_calls;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM auth.users WHERE email = 'insider@grida.co'), true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(sql, '42501', NULL, 'project member cannot invoke privileged OTP RPC') FROM otp_calls;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM auth.users WHERE email = 'alice@acme.com'), true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(sql, '42501', NULL, 'other tenant cannot invoke privileged OTP RPC') FROM otp_calls;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM auth.users WHERE email = 'random@example.com'), true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(sql, '42501', NULL, 'nonmember cannot invoke privileged OTP RPC') FROM otp_calls;
RESET ROLE;

-- Complete wrong-code calls normally. No exception wrapper may
-- hide the rollback bug that motivated this regression.
SET LOCAL ROLE service_role;
SELECT is((SELECT count(*) FROM grida_ciam_public.verify_customer_otp_and_create_session(
  (SELECT challenge_id FROM otp_cases WHERE label = 'attempts'), lpad(n::text, 6, '0'), 0)), 0::bigint,
  'wrong guess ' || n || ' returns zero rows') FROM generate_series(1, 8) n;
SELECT is((SELECT attempt_count FROM grida_ciam.customer_otp_challenge
  WHERE id = (SELECT challenge_id FROM otp_cases WHERE label = 'attempts')), 8,
  'all eight failed guesses persist');
SELECT is((SELECT count(*) FROM grida_ciam_public.verify_customer_otp_and_create_session(
  (SELECT challenge_id FROM otp_cases WHERE label = 'attempts'), '123456', 0)), 0::bigint,
  'correct ninth guess cannot bypass exhausted attempts');
SELECT ok((SELECT consumed_at IS NULL FROM grida_ciam.customer_otp_challenge
  WHERE id = (SELECT challenge_id FROM otp_cases WHERE label = 'attempts')),
  'exhausted challenge remains unconsumed');
SELECT is((SELECT count(*) FROM grida_ciam_public.verify_customer_otp_and_create_session(
  (SELECT challenge_id FROM otp_cases WHERE label = 'null'), NULL, 0)), 0::bigint,
  'NULL OTP fails closed');
SELECT is((SELECT attempt_count FROM grida_ciam.customer_otp_challenge
  WHERE id = (SELECT challenge_id FROM otp_cases WHERE label = 'null')), 1,
  'NULL OTP records a failed attempt');
SELECT is((SELECT count(*) FROM grida_ciam_public.verify_customer_otp_and_create_session(
  gen_random_uuid(), '123456', 0)), 0::bigint, 'unknown challenge denied');
UPDATE grida_ciam.customer_otp_challenge SET expires_at = clock_timestamp() - interval '1 second'
  WHERE id = (SELECT challenge_id FROM otp_cases WHERE label = 'expired');
SELECT is((SELECT count(*) FROM grida_ciam_public.verify_customer_otp_and_create_session(
  (SELECT challenge_id FROM otp_cases WHERE label = 'expired'), '123456', 0)), 0::bigint,
  'expired challenge denied');

-- Service role can issue; normalized variants cannot bypass the recipient lock.
SELECT ok(grida_ciam_public.create_customer_otp_challenge(
  (SELECT project_id FROM otp_forms WHERE tenant = 'local'), ' CoolDown@Example.COM ', '123456', 600
) IS NOT NULL, 'service can issue a challenge with normalized recipient');
SELECT throws_ok(format('SELECT grida_ciam_public.create_customer_otp_challenge(%s,%L,%L,600)',
  (SELECT project_id FROM otp_forms WHERE tenant = 'local'), 'cooldown@example.com', '999999'),
  'PT429', 'OTP recipient cooldown', 'repeat recipient issuance denied for 60 seconds');
SELECT is((SELECT count(*) FROM grida_ciam.customer_otp_challenge
  WHERE email = 'cooldown@example.com' AND project_id = (SELECT project_id FROM otp_forms WHERE tenant = 'local')),
  1::bigint, 'denied issuance did not insert another challenge');
SELECT ok(grida_ciam_public.create_customer_otp_challenge(
  (SELECT project_id FROM otp_forms WHERE tenant = 'acme'), 'cooldown@example.com', '123456', 600
) IS NOT NULL, 'same recipient in another project has independent cooldown');
UPDATE grida_ciam.customer_otp_challenge SET created_at = clock_timestamp() - interval '61 seconds'
  WHERE email = 'cooldown@example.com' AND project_id = (SELECT project_id FROM otp_forms WHERE tenant = 'local');
SELECT ok(grida_ciam_public.create_customer_otp_challenge(
  (SELECT project_id FROM otp_forms WHERE tenant = 'local'), 'cooldown@example.com', '123456', 600
) IS NOT NULL, 'recipient can receive a new challenge after cooldown');

-- Generic CIAM success remains compatible with portal callers.
SELECT is((SELECT customer_uid FROM grida_ciam_public.verify_customer_otp_and_create_session(
  (SELECT challenge_id FROM otp_cases WHERE label = 'null'), '123456', 0)),
  (SELECT customer_uid FROM otp_cases WHERE label = 'null'), 'generic verifier returns customer scope');
SELECT is((SELECT count(*) FROM grida_ciam_public.verify_customer_otp_and_create_session(
  (SELECT challenge_id FROM otp_cases WHERE label = 'null'), '123456', 0)), 0::bigint,
  'generic verification cannot replay a consumed OTP');

-- Correct Forms OTP atomically commits identity, verification and state.
SELECT is((SELECT state->>'state' FROM grida_forms.verify_email_otp(
  (SELECT session_id FROM otp_cases WHERE label = 'success'),
  (SELECT field_id FROM otp_cases WHERE label = 'success'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'success'), '123456')),
  'challenge-success', 'Forms verification returns committed success');
SELECT is((SELECT customer_id FROM grida_forms.response_session
  WHERE id = (SELECT session_id FROM otp_cases WHERE label = 'success')),
  (SELECT customer_uid FROM otp_cases WHERE label = 'success'), 'identity field binds its customer');
SELECT is((SELECT s.raw->('__challenge_email__' || c.field_id::text)->>'customer_uid'
  FROM grida_forms.response_session s JOIN otp_cases c ON c.session_id = s.id WHERE c.label = 'success'),
  (SELECT customer_uid::text FROM otp_cases WHERE label = 'success'), 'persisted state carries the verified customer');
SELECT is((SELECT raw->>'untouched' FROM grida_forms.response_session
  WHERE id = (SELECT session_id FROM otp_cases WHERE label = 'success')), 'draft', 'unrelated draft survives verification');
SELECT ok((SELECT is_email_verified FROM public.customer
  WHERE uid = (SELECT customer_uid FROM otp_cases WHERE label = 'success')), 'customer email is marked verified');
SELECT ok((SELECT consumed_at IS NOT NULL FROM grida_ciam.customer_otp_challenge
  WHERE id = (SELECT challenge_id FROM otp_cases WHERE label = 'success')), 'Forms success consumes challenge');
SELECT is((SELECT count(*) FROM grida_forms.verify_email_otp(
  (SELECT session_id FROM otp_cases WHERE label = 'success'),
  (SELECT field_id FROM otp_cases WHERE label = 'success'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'success'), '123456')), 0::bigint,
  'Forms verification rejects replay');
SELECT is((SELECT s.raw->('__challenge_email__' || c.field_id::text)->>'state'
  FROM grida_forms.response_session s JOIN otp_cases c ON c.session_id = s.id WHERE c.label = 'success'),
  'challenge-success', 'replay does not downgrade successful state');

SELECT is((SELECT count(*) FROM grida_forms.verify_email_otp(
  (SELECT session_id FROM otp_cases WHERE label = 'formwrong'),
  (SELECT field_id FROM otp_cases WHERE label = 'formwrong'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'formwrong'), '000000')), 0::bigint,
  'Forms wrong guess returns denial without raising');
SELECT is((SELECT attempt_count FROM grida_ciam.customer_otp_challenge
  WHERE id = (SELECT challenge_id FROM otp_cases WHERE label = 'formwrong')), 1,
  'Forms wrong guess persists its counter');
SELECT is((SELECT s.raw->('__challenge_email__' || c.field_id::text)->>'state'
  FROM grida_forms.response_session s JOIN otp_cases c ON c.session_id = s.id WHERE c.label = 'formwrong'),
  'challenge-failed', 'Forms wrong guess persists failed state');
SELECT is((SELECT state->>'state' FROM grida_forms.verify_email_otp(
  (SELECT session_id FROM otp_cases WHERE label = 'formwrong'),
  (SELECT field_id FROM otp_cases WHERE label = 'formwrong'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'formwrong'), '123456')),
  'challenge-success', 'correct retry within attempt limit succeeds');
SELECT is((SELECT count(*) FROM grida_forms.verify_email_otp(
  (SELECT session_id FROM otp_cases WHERE label = 'formnull'),
  (SELECT field_id FROM otp_cases WHERE label = 'formnull'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'formnull'), NULL)), 0::bigint,
  'Forms NULL OTP is denied');
SELECT is((SELECT attempt_count FROM grida_ciam.customer_otp_challenge
  WHERE id = (SELECT challenge_id FROM otp_cases WHERE label = 'formnull')), 1,
  'Forms NULL OTP persists a failed attempt');

UPDATE grida_forms.response_session SET customer_id = (SELECT customer_uid FROM otp_cases WHERE label = 'success')
  WHERE id = (SELECT session_id FROM otp_cases WHERE label = 'nonidentity');
SELECT is((SELECT state->>'state' FROM grida_forms.verify_email_otp(
  (SELECT session_id FROM otp_cases WHERE label = 'nonidentity'),
  (SELECT field_id FROM otp_cases WHERE label = 'nonidentity'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'nonidentity'), '123456')),
  'challenge-success', 'ordinary challenge field can verify an email');
SELECT is((SELECT customer_id FROM grida_forms.response_session
  WHERE id = (SELECT session_id FROM otp_cases WHERE label = 'nonidentity')),
  (SELECT customer_uid FROM otp_cases WHERE label = 'success'),
  'ordinary challenge field cannot replace existing session identity');

-- Mismatched session, field, latest ID, email and project never consume authority.
UPDATE grida_forms.response_session SET raw = '{}'::jsonb
  WHERE id = (SELECT session_id FROM otp_cases WHERE label = 'missing');
UPDATE grida_forms.response_session SET raw = jsonb_set(raw,
  ARRAY['__challenge_email__' || (SELECT field_id::text FROM otp_cases WHERE label = 'latest'), 'challenge_id'],
  to_jsonb(gen_random_uuid()::text)) WHERE id = (SELECT session_id FROM otp_cases WHERE label = 'latest');
UPDATE grida_forms.response_session SET raw = jsonb_set(raw,
  ARRAY['__challenge_email__' || (SELECT field_id::text FROM otp_cases WHERE label = 'emailmismatch'), 'email'],
  '"different@example.com"'::jsonb) WHERE id = (SELECT session_id FROM otp_cases WHERE label = 'emailmismatch');
UPDATE grida_ciam.customer_otp_challenge SET project_id = (SELECT project_id FROM otp_forms WHERE tenant = 'acme')
  WHERE id = (SELECT challenge_id FROM otp_cases WHERE label = 'foreignproject');
SELECT is((SELECT count(*) FROM grida_forms.verify_email_otp(session_id, field_id, challenge_id, '123456')),
  0::bigint, label || ' scope is denied') FROM otp_cases
  WHERE label IN ('missing', 'latest', 'emailmismatch', 'foreignproject') ORDER BY label;
SELECT is((SELECT count(*) FROM grida_forms.verify_email_otp(
  (SELECT session_id FROM otp_cases WHERE label = 'scope'),
  (SELECT identity_field FROM otp_forms WHERE tenant = 'acme'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'scope'), '123456')), 0::bigint,
  'field from another form cannot verify session');
SELECT is((SELECT count(*) FROM grida_forms.verify_email_otp(
  (SELECT session_id FROM otp_cases WHERE label = 'scope'),
  (SELECT other_field FROM otp_forms WHERE tenant = 'local'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'scope'), '123456')), 0::bigint,
  'another challenge field on the same form cannot use the OTP');
SELECT is((SELECT count(*) FROM grida_forms.verify_email_otp(
  (SELECT session_id FROM otp_cases WHERE label = 'scope'),
  (SELECT plain_field FROM otp_forms WHERE tenant = 'local'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'scope'), '123456')), 0::bigint,
  'non-challenge field cannot verify OTP');
SELECT is((SELECT count(*) FROM grida_forms.verify_email_otp(
  (SELECT session_id FROM otp_cases WHERE label = 'scope'),
  (SELECT field_id FROM otp_cases WHERE label = 'scope'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'missing'), '123456')), 0::bigint,
  'another session challenge cannot be consumed');
SELECT ok(NOT EXISTS(SELECT 1 FROM grida_ciam.customer_otp_challenge ch
  JOIN otp_cases c ON c.challenge_id = ch.id WHERE c.label IN
  ('scope', 'missing', 'latest', 'emailmismatch', 'foreignproject')
  AND (ch.consumed_at IS NOT NULL OR ch.attempt_count <> 0)),
  'all scope denials leave consumption and attempt counts untouched');
SELECT ok(NOT EXISTS(SELECT 1 FROM grida_forms.response_session s
  JOIN otp_cases c ON c.session_id = s.id WHERE c.label IN
  ('scope', 'missing', 'latest', 'emailmismatch', 'foreignproject') AND s.customer_id IS NOT NULL),
  'scope denials cannot bind a customer');

-- Real write failure after generic consumption must roll back the whole RPC.
RESET ROLE;
CREATE FUNCTION pg_temp.reject_otp_success() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = (SELECT session_id FROM otp_cases WHERE label = 'rollback') THEN
    RAISE EXCEPTION 'injected OTP state write failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_reject_otp_success BEFORE UPDATE ON grida_forms.response_session
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_otp_success();
SET LOCAL ROLE service_role;
SELECT throws_ok(format('SELECT * FROM grida_forms.verify_email_otp(%L,%L,%L,%L)',
  (SELECT session_id FROM otp_cases WHERE label = 'rollback'),
  (SELECT field_id FROM otp_cases WHERE label = 'rollback'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'rollback'), '123456'),
  'P0001', 'injected OTP state write failure', 'unexpected write failure is not false success');
SELECT ok((SELECT consumed_at IS NULL FROM grida_ciam.customer_otp_challenge
  WHERE id = (SELECT challenge_id FROM otp_cases WHERE label = 'rollback')), 'failed transaction rolls back OTP consumption');
SELECT ok((SELECT NOT is_email_verified FROM public.customer
  WHERE uid = (SELECT customer_uid FROM otp_cases WHERE label = 'rollback')), 'failed transaction rolls back email verification');
SELECT ok((SELECT customer_id IS NULL FROM grida_forms.response_session
  WHERE id = (SELECT session_id FROM otp_cases WHERE label = 'rollback')), 'failed transaction does not bind session identity');
SELECT is((SELECT s.raw->('__challenge_email__' || c.field_id::text)->>'state'
  FROM grida_forms.response_session s JOIN otp_cases c ON c.session_id = s.id WHERE c.label = 'rollback'),
  'challenge-session-started', 'failed transaction preserves retryable challenge state');
RESET ROLE;
DROP TRIGGER test_reject_otp_success ON grida_forms.response_session;
SET LOCAL ROLE service_role;
SELECT is((SELECT state->>'state' FROM grida_forms.verify_email_otp(
  (SELECT session_id FROM otp_cases WHERE label = 'rollback'),
  (SELECT field_id FROM otp_cases WHERE label = 'rollback'),
  (SELECT challenge_id FROM otp_cases WHERE label = 'rollback'), '123456')),
  'challenge-success', 'same OTP succeeds after transient write failure clears');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
