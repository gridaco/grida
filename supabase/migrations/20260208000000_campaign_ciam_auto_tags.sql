-- Campaign CIAM auto-tagging
-- Adds per-campaign tag-name list that is automatically applied to the
-- invitee customer when an invitation is claimed.
-- Fully DB-side via trigger; no server changes.

---------------------------------------------------------------------
-- 1. Add column to campaign
---------------------------------------------------------------------
ALTER TABLE grida_west_referral.campaign
  ADD COLUMN ciam_invitee_on_claim_tag_names text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN grida_west_referral.campaign.ciam_invitee_on_claim_tag_names
  IS 'Tag names auto-applied to invitee customer when invitation is claimed';

---------------------------------------------------------------------
-- 2. Helper: add-only tag application (no removals)
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west_referral.apply_customer_tags(
  p_customer_uid uuid,
  p_project_id bigint,
  p_tag_names text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, grida_ciam
AS $$
DECLARE
  tag text;
BEGIN
  IF p_tag_names IS NULL OR array_length(p_tag_names, 1) IS NULL THEN
    RETURN;
  END IF;

  FOREACH tag IN ARRAY p_tag_names LOOP
    INSERT INTO public.tag (project_id, name)
    VALUES (p_project_id, tag)
    ON CONFLICT (project_id, name) DO NOTHING;

    INSERT INTO grida_ciam.customer_tag (customer_uid, project_id, tag_name)
    VALUES (p_customer_uid, p_project_id, tag)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- Only callable by triggers / service_role; block direct RPC from anon/authenticated.
REVOKE EXECUTE ON FUNCTION grida_west_referral.apply_customer_tags(uuid, bigint, text[]) FROM anon, authenticated;

---------------------------------------------------------------------
-- 3. Trigger: auto-tag invitee on claim
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west_referral.trg_auto_tag_invitee_on_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tag_names text[];
  v_project_id bigint;
BEGIN
  IF OLD.is_claimed = false AND NEW.is_claimed = true AND NEW.customer_id IS NOT NULL THEN
    SELECT c.ciam_invitee_on_claim_tag_names, c.project_id
    INTO v_tag_names, v_project_id
    FROM grida_west_referral.campaign c
    WHERE c.id = NEW.campaign_id;

    IF v_tag_names IS NOT NULL AND array_length(v_tag_names, 1) > 0 THEN
      PERFORM grida_west_referral.apply_customer_tags(NEW.customer_id, v_project_id, v_tag_names);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_tag_invitee_on_claim
AFTER UPDATE ON grida_west_referral.invitation
FOR EACH ROW
EXECUTE FUNCTION grida_west_referral.trg_auto_tag_invitee_on_claim();
