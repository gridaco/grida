-- Partial human reference: Forms email verification transaction.
-- Existing Forms tables remain defined by migration history.
-- Server-only: derives all authority from the stored session, field and challenge.
-- Zero rows means denied; a raised write error rolls back OTP consumption.

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
