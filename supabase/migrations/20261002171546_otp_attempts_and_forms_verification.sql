-- OTP failures must commit their attempt counter. Forms verification must consume
-- the challenge, bind identity and persist success in the same transaction.
BEGIN;

CREATE INDEX IF NOT EXISTS customer_otp_challenge_recipient_cooldown
ON grida_ciam.customer_otp_challenge (project_id, lower(btrim(email)), created_at DESC);

CREATE OR REPLACE FUNCTION grida_ciam_public.create_customer_otp_challenge(
    p_project_id bigint,
    p_email text,
    p_otp text,
    p_expires_in_seconds int DEFAULT 600
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    v_email text := lower(btrim(p_email));
    v_customer_uid uuid;
    v_challenge_id uuid;
    v_salt bytea;
    v_now timestamptz;
BEGIN
    IF p_project_id IS NULL OR v_email IS NULL OR v_email = ''
       OR p_otp IS NULL OR p_otp = ''
       OR p_expires_in_seconds IS NULL OR p_expires_in_seconds <= 0 THEN
        RAISE EXCEPTION 'invalid challenge parameters' USING ERRCODE = '22023';
    END IF;

    -- Serializes issuance across sessions for one normalized recipient/project.
    -- A transaction lock plus a fresh READ COMMITTED query prevents two concurrent
    -- starts from both observing no recent challenge. Hash collisions only serialize
    -- unrelated recipients; the cooldown query still uses the exact recipient.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_project_id::text || ':' || v_email, 0)
    );
    v_now := clock_timestamp();
    IF EXISTS (
        SELECT 1 FROM grida_ciam.customer_otp_challenge c
        WHERE c.project_id = p_project_id
          AND lower(btrim(c.email)) = v_email
          AND c.created_at > v_now - interval '60 seconds'
    ) THEN
        RAISE EXCEPTION 'OTP recipient cooldown' USING ERRCODE = 'PT429';
    END IF;

    -- Rows predating the normalization trigger may retain mixed-case email text.
    SELECT c.uid INTO v_customer_uid
    FROM public.customer c
    WHERE c.project_id = p_project_id AND lower(btrim(c.email)) = v_email
    ORDER BY c.uid LIMIT 1;

    v_salt := extensions.gen_random_bytes(16);
    INSERT INTO grida_ciam.customer_otp_challenge (
        project_id, email, customer_uid, token_type, otp_salt, otp_hash,
        created_at, expires_at
    ) VALUES (
        p_project_id, v_email, v_customer_uid, 'confirmation_token', v_salt,
        extensions.digest(v_salt || convert_to(p_otp, 'utf8'), 'sha256'),
        v_now, v_now + make_interval(secs => p_expires_in_seconds)
    ) RETURNING id INTO v_challenge_id;

    RETURN v_challenge_id;
END;
$function$;

REVOKE ALL ON FUNCTION grida_ciam_public.create_customer_otp_challenge(bigint, text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION grida_ciam_public.create_customer_otp_challenge(bigint, text, text, int) TO service_role;

CREATE OR REPLACE FUNCTION grida_ciam_public.verify_customer_otp_and_create_session(
    p_challenge_id uuid,
    p_otp text,
    p_session_ttl_seconds int DEFAULT 2592000
)
RETURNS TABLE (customer_uid uuid, project_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    c grida_ciam.customer_otp_challenge%ROWTYPE;
    v_hash bytea;
BEGIN
    -- The legacy TTL argument remains for callers; this RPC does not mint sessions.
    SELECT * INTO c FROM grida_ciam.customer_otp_challenge
    WHERE id = p_challenge_id FOR UPDATE;

    IF NOT FOUND THEN RETURN; END IF;
    IF c.consumed_at IS NOT NULL OR c.expires_at <= clock_timestamp()
       OR c.attempt_count >= 8 OR c.token_type <> 'confirmation_token' THEN
        RETURN;
    END IF;

    v_hash := extensions.digest(c.otp_salt || convert_to(p_otp, 'utf8'), 'sha256');
    -- IS DISTINCT FROM also rejects a NULL OTP (SQL NULL must not skip denial).
    IF v_hash IS DISTINCT FROM c.otp_hash OR c.customer_uid IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM public.customer u
           WHERE u.uid = c.customer_uid AND u.project_id = c.project_id
       ) THEN
        UPDATE grida_ciam.customer_otp_challenge
        SET attempt_count = attempt_count + 1 WHERE id = c.id;
        -- Raising here would roll back the counter. Zero rows is the denied result.
        RETURN;
    END IF;

    UPDATE public.customer
    SET is_email_verified = true, email = c.email
    WHERE uid = c.customer_uid AND public.customer.project_id = c.project_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'OTP customer binding changed';
    END IF;

    UPDATE grida_ciam.customer_otp_challenge
    SET consumed_at = clock_timestamp() WHERE id = c.id;

    RETURN QUERY SELECT c.customer_uid, c.project_id;
END;
$function$;

REVOKE ALL ON FUNCTION grida_ciam_public.verify_customer_otp_and_create_session(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION grida_ciam_public.verify_customer_otp_and_create_session(uuid, text, int) TO service_role;

CREATE OR REPLACE FUNCTION grida_forms.verify_email_otp(
    p_session_id uuid,
    p_field_id uuid,
    p_challenge_id uuid,
    p_otp text
)
RETURNS TABLE (state jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    s grida_forms.response_session%ROWTYPE;
    f grida_forms.attribute%ROWTYPE;
    c grida_ciam.customer_otp_challenge%ROWTYPE;
    v_project_id bigint;
    v_key text := '__challenge_email__' || p_field_id::text;
    v_prior jsonb;
    v_state jsonb;
    v_verified record;
BEGIN
    SELECT * INTO s FROM grida_forms.response_session
    WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT * INTO f FROM grida_forms.attribute
    WHERE id = p_field_id AND form_id = s.form_id AND type = 'challenge_email'
    FOR SHARE;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT project_id INTO v_project_id FROM grida_forms.form
    WHERE id = s.form_id FOR SHARE;
    IF NOT FOUND THEN RETURN; END IF;

    v_prior := s.raw -> v_key;
    -- Absence is denial, not permission to attach an arbitrary project OTP.
    IF jsonb_typeof(v_prior) IS DISTINCT FROM 'object'
       OR (v_prior ->> 'challenge_id') IS DISTINCT FROM p_challenge_id::text
       OR (v_prior ->> 'state') IS NULL
       OR (v_prior ->> 'state') NOT IN ('challenge-session-started', 'challenge-failed') THEN
        RETURN;
    END IF;

    SELECT * INTO c FROM grida_ciam.customer_otp_challenge
    WHERE id = p_challenge_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    IF c.project_id IS DISTINCT FROM v_project_id
       OR (v_prior ->> 'email') IS DISTINCT FROM c.email THEN
        RETURN;
    END IF;

    SELECT * INTO v_verified
    FROM grida_ciam_public.verify_customer_otp_and_create_session(p_challenge_id, p_otp, 0);

    IF NOT FOUND THEN
        v_state := jsonb_build_object(
            'state', 'challenge-failed', 'email', c.email,
            'challenge_id', c.id, 'expires_at', c.expires_at,
            'verified_at', NULL, 'customer_uid', NULL
        );
        UPDATE grida_forms.response_session
        SET raw = jsonb_set(COALESCE(s.raw, '{}'::jsonb), ARRAY[v_key], v_state, true)
        WHERE id = s.id;
        IF NOT FOUND THEN RAISE EXCEPTION 'OTP session disappeared'; END IF;
        RETURN;
    END IF;

    v_state := jsonb_build_object(
        'state', 'challenge-success', 'email', c.email,
        'challenge_id', c.id, 'expires_at', c.expires_at,
        'verified_at', clock_timestamp(), 'customer_uid', v_verified.customer_uid
    );
    UPDATE grida_forms.response_session
    SET customer_id = CASE WHEN f.name = '__gf_customer_email'
                           THEN v_verified.customer_uid ELSE s.customer_id END,
        raw = jsonb_set(COALESCE(s.raw, '{}'::jsonb), ARRAY[v_key], v_state, true)
    WHERE id = s.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'OTP session disappeared'; END IF;

    -- No exception handler: unexpected writes roll back consumption and all binds.
    RETURN QUERY SELECT v_state;
END;
$function$;

REVOKE ALL ON FUNCTION grida_forms.verify_email_otp(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION grida_forms.verify_email_otp(uuid, uuid, uuid, text) TO service_role;

COMMIT;
