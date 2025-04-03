-- V2 - complete rework of the grida_west schema / this is not yet used. safe to drop and recreate.
DROP SCHEMA IF EXISTS grida_west CASCADE;


--                                                                                                               --
--                                                                                                               --
--                        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓████████▓▒░░▒▓███████▓▒░▒▓████████▓▒░                           --
--                        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░         ░▒▓█▓▒░                               --
--                        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░         ░▒▓█▓▒░                               --
--                        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓██████▓▒░  ░▒▓██████▓▒░   ░▒▓█▓▒░                               --
--                        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░             ░▒▓█▓▒░  ░▒▓█▓▒░                               --
--                        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░             ░▒▓█▓▒░  ░▒▓█▓▒░                               --
--                         ░▒▓█████████████▓▒░░▒▓████████▓▒░▒▓███████▓▒░   ░▒▓█▓▒░                               --
--                                                                                                               --
--                                                                                                               --

CREATE SCHEMA IF NOT EXISTS grida_west_referral;
ALTER SCHEMA "grida_west_referral" OWNER TO "postgres";

GRANT USAGE ON SCHEMA grida_west_referral TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA grida_west_referral TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA grida_west_referral TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA grida_west_referral TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_west_referral GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_west_referral GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_west_referral GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;



---------------------------------------------------------------------
-- [generate random short code] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west_referral.gen_random_short_code()
RETURNS VARCHAR AS $$
BEGIN
  RETURN substr(md5(gen_random_uuid()::text), 1, 8); -- Adjust length as needed
END;
$$ LANGUAGE plpgsql;


---------------------------------------------------------------------
-- [Prevent updates on immutable records] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west_referral.prevent_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'This record is immutable and cannot be modified.';
END;
$$ LANGUAGE plpgsql;


---------------------------------------------------------------------
-- [Insert with token - table with (campaign_id, code) - ensures the uniqueness of code across campaign] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west_referral.insert_with_code()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO grida_west_referral.code (campaign_id, code)
  VALUES (NEW.campaign_id, NEW.code);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

---------------------------------------------------------------------
-- [virtual currency type] --
---------------------------------------------------------------------
CREATE DOMAIN grida_west_referral.virtual_currency AS TEXT
CHECK (
  length(VALUE) >= 1 AND
  length(VALUE) <= 10 AND
  VALUE !~ '[\u0000-\u001F]'
);


---------------------------------------------------------------------
-- [token_role] --
---------------------------------------------------------------------
CREATE TYPE grida_west_referral.token_role AS ENUM ('referrer', 'invitation');


---------------------------------------------------------------------
-- [Campaign] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.campaign (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                                      -- Unique identifier
  project_id BIGINT NOT NULL REFERENCES public.project(id) ON DELETE CASCADE,         -- Project namespace identifier
  
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),                           -- Campaign name (e.g., "Spring 2025 Campaign") / will be public
  description TEXT,                                                                   -- Campaign description / will NOT be public

  is_referrer_name_exposed_to_public_dangerously BOOLEAN NOT NULL DEFAULT FALSE,      -- Expose referrer name to public
  is_invitee_name_exposed_to_public_dangerously BOOLEAN NOT NULL DEFAULT FALSE,       -- Expose invitee name to public
  max_invitations_per_referrer INTEGER DEFAULT NULL,                                  -- Maximum number of tokens per host

  reward_currency grida_west_referral.virtual_currency NOT NULL DEFAULT 'XTS',
  conversion_currency grida_west_referral.virtual_currency NOT NULL DEFAULT 'XTS',
  conversion_value NUMERIC(12, 2),

  enabled BOOLEAN NOT NULL DEFAULT true,                                              -- Enable/disable the campaign
  scheduling_open_at timestamp with time zone null,
  scheduling_close_at timestamp with time zone null,
  scheduling_tz text null,

  public JSONB DEFAULT '{}'::jsonb,                                                   -- custom additional public data for the campaign / will be public
  metadata JSONB DEFAULT NULL,                                                        -- Flexible additional private data for the campaign / will NOT be public

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                                      -- timestamp

  CONSTRAINT unique_campaign_id_project_id UNIQUE (id, project_id)
);

ALTER TABLE grida_west_referral.campaign enable row level security;
CREATE POLICY "access_based_on_project_membership" ON grida_west_referral.campaign USING (public.rls_project(project_id)) WITH CHECK (public.rls_project(project_id));


---------------------------------------------------------------------
-- [rls_campaign] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west_referral.rls_campaign(p_campaign_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM grida_west_referral.campaign ts
        WHERE ts.id = p_campaign_id
          AND public.rls_project(ts.project_id)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;



---------------------------------------------------------------------
-- [Campaign Wellknown Event] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.campaign_wellknown_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (
      char_length(trim(name)) > 0 
      AND char_length(name) <= 100 
    ),
    description TEXT NULL CHECK (description IS NULL OR char_length(description) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, name)
);

ALTER TABLE public.tag ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_based_on_campaign_project_membership" ON grida_west_referral.campaign_wellknown_event USING (grida_west_referral.rls_campaign(campaign_id));



---------------------------------------------------------------------
-- [Campaign Challenge] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.campaign_challenge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  index INTEGER NOT NULL,
  campaign_id UUID NOT NULL REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES grida_west_referral.campaign_wellknown_event(id) ON DELETE CASCADE,
  depends_on UUID REFERENCES grida_west_referral.campaign_challenge(id) ON DELETE SET NULL,
  description TEXT
);


---------------------------------------------------------------------
-- [Campaign Referrer Milestone Reward] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.campaign_referrer_milestone_reward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
  threshold_count INTEGER NOT NULL CHECK (threshold_count > 0),  -- e.g. 1, 2, 3, 10
  reward_description TEXT NOT NULL,  -- e.g. "$10 credit", "Free item"
  reward_value NUMERIC(12, 2) CHECK (reward_value >= 0),
  metadata JSONB NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (campaign_id, threshold_count)
);

---------------------------------------------------------------------
-- [Campaign Invitee Onboarding Reward] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.campaign_invitee_onboarding_reward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
  reward_description TEXT NOT NULL,  -- e.g. "$10 credit", "Free item"
  reward_value NUMERIC(12, 2) CHECK (reward_value >= 0),
  metadata JSONB NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


---------------------------------------------------------------------
-- [Campaign (Public)] --
---------------------------------------------------------------------
CREATE OR REPLACE VIEW grida_west_referral.campaign_public AS
SELECT
  id,
  name,
  enabled,
  scheduling_open_at,
  scheduling_close_at,
  scheduling_tz,
  public
FROM grida_west_referral.campaign;

GRANT SELECT ON grida_west_referral.campaign_public TO anon, authenticated, service_role;


---------------------------------------------------------------------
-- [Code] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.code (
    id SERIAL PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
    code VARCHAR(256) NOT NULL DEFAULT grida_west_referral.gen_random_short_code(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, code)
);


---------------------------------------------------------------------
-- [Referrer] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.referrer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES public.project(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
    code VARCHAR(256) NOT NULL DEFAULT grida_west_referral.gen_random_short_code(),
    customer_id UUID NOT NULL REFERENCES public.customer(uid) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB CHECK (jsonb_typeof(metadata) = 'object'),

    CONSTRAINT unique_referrer_customer_per_campaign UNIQUE (campaign_id, customer_id),
    CONSTRAINT fk_referrer_campaign_project FOREIGN KEY (campaign_id, project_id) REFERENCES grida_west_referral.campaign(id, project_id),
    CONSTRAINT fk_referrer_customer_project FOREIGN KEY (customer_id, project_id) REFERENCES public.customer(uid, project_id),
    FOREIGN KEY (campaign_id, code) 
      REFERENCES grida_west_referral.code(campaign_id, code) 
      ON UPDATE CASCADE -- ensures tag renames cascade correctly
      ON DELETE CASCADE
);

ALTER TABLE grida_west_referral.referrer enable row level security;
CREATE POLICY "access_based_on_campaign_project_membership"
ON grida_west_referral.referrer
USING (grida_west_referral.rls_campaign(campaign_id));


CREATE TRIGGER trg_insert_token_for_referrer BEFORE INSERT ON grida_west_referral.referrer FOR EACH ROW EXECUTE FUNCTION grida_west_referral.insert_with_code();

---------------------------------------------------------------------
-- [Referrer (Public)] --
---------------------------------------------------------------------
CREATE OR REPLACE VIEW grida_west_referral.referrer_public AS
SELECT
  r.id,
  r.campaign_id,
  CASE
    WHEN c.is_referrer_name_exposed_to_public_dangerously THEN cus.name
    ELSE NULL
  END AS name
FROM grida_west_referral.referrer r
JOIN grida_west_referral.campaign c ON r.campaign_id = c.id
JOIN public.customer cus ON r.customer_id = cus.uid;

GRANT SELECT ON grida_west_referral.referrer_public TO anon, authenticated, service_role;



---------------------------------------------------------------------
-- [Invitation] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.invitation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES grida_west_referral.referrer(id) ON DELETE CASCADE,
  code VARCHAR(256) NOT NULL DEFAULT grida_west_referral.gen_random_short_code(),
  customer_id UUID NULL REFERENCES public.customer(uid) ON DELETE CASCADE,
  is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB CHECK (jsonb_typeof(metadata) = 'object'),

  CONSTRAINT unique_invitation_code_per_campaign UNIQUE (campaign_id, code),
  CONSTRAINT unique_invitation_customer_per_campaign UNIQUE (campaign_id, customer_id),
  CHECK (is_claimed = (customer_id IS NOT NULL)),
  FOREIGN KEY (campaign_id, code) 
      REFERENCES grida_west_referral.code(campaign_id, code) 
      ON UPDATE CASCADE -- ensures tag renames cascade correctly
      ON DELETE CASCADE
);

CREATE TRIGGER trg_insert_token_for_invitation BEFORE INSERT ON grida_west_referral.invitation FOR EACH ROW EXECUTE FUNCTION grida_west_referral.insert_with_code();

---------------------------------------------------------------------
-- [Invitation (Public)] --
---------------------------------------------------------------------
CREATE OR REPLACE VIEW grida_west_referral.invitation_public AS
SELECT
  i.campaign_id,
  i.id AS invitation_id,
  i.referrer_id,
  CASE
    WHEN c.is_invitee_name_exposed_to_public_dangerously THEN cust.name
    ELSE NULL
  END AS name
FROM grida_west_referral.invitation i
JOIN grida_west_referral.campaign c ON i.campaign_id = c.id
JOIN public.customer cust ON i.customer_id = cust.uid;

GRANT SELECT ON grida_west_referral.invitation_public TO anon, authenticated, service_role;



---------------------------------------------------------------------
-- [Onboarding (Invitation Progress)] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
  invitation_id UUID NOT NULL UNIQUE REFERENCES grida_west_referral.invitation(id) ON DELETE CASCADE,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ
);

CREATE TRIGGER trg_prevent_update_on_onboarding_complete BEFORE UPDATE ON grida_west_referral.onboarding FOR EACH ROW EXECUTE FUNCTION grida_west_referral.prevent_update(); -- prevents updates on when is_completed is true


---------------------------------------------------------------------
-- [Onboarding Challenge Flag] --
---------------------------------------------------------------------
-- TODO: no write, only service_role
CREATE TABLE grida_west_referral.onboarding_challenge_flag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
  invitation_id UUID NOT NULL REFERENCES grida_west_referral.invitation(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_prevent_update_on_onboarding_challenge_flag BEFORE UPDATE ON grida_west_referral.onboarding_challenge_flag FOR EACH ROW EXECUTE FUNCTION grida_west_referral.prevent_update(); -- always prevents updates

---------------------------------------------------------------------
-- [Reward / Referrer] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.onboarding_referrer_reward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
  onboarding_id UUID NOT NULL REFERENCES grida_west_referral.onboarding(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES grida_west_referral.referrer(id) ON DELETE CASCADE,
  reward_description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

---------------------------------------------------------------------
-- [Reward / Invitee] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.onboarding_invitee_reward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
  onboarding_id UUID NOT NULL REFERENCES grida_west_referral.onboarding(id) ON DELETE CASCADE,
  invitation_id UUID NOT NULL UNIQUE REFERENCES grida_west_referral.invitation(id) ON DELETE CASCADE,
  reward_description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

---------------------------------------------------------------------
-- [Event Log] --
---------------------------------------------------------------------
CREATE TABLE grida_west_referral.event_log (
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    campaign_id UUID NOT NULL REFERENCES grida_west_referral.campaign(id) ON DELETE CASCADE,
    referrer_id UUID REFERENCES grida_west_referral.referrer(id) ON DELETE CASCADE,
    onboarding_id UUID REFERENCES grida_west_referral.onboarding(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customer(uid) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
    data JSONB DEFAULT NULL CHECK (jsonb_typeof(data) = 'object' AND pg_column_size(data) <= 1024),
    PRIMARY KEY (time, campaign_id, name)
);

ALTER TABLE grida_west_referral.event_log enable row level security;

-- Convert to hypertable
SELECT create_hypertable('grida_west_referral.event_log', 'time', chunk_time_interval => INTERVAL '7 days');
CREATE INDEX idx_event_campaign_id ON grida_west_referral.event_log (campaign_id, time DESC);
CREATE INDEX idx_event_name ON grida_west_referral.event_log (name, time DESC);
CREATE INDEX idx_event_campaign_name_time ON grida_west_referral.event_log (campaign_id, name, time DESC);
CREATE INDEX idx_event_referrer_id ON grida_west_referral.event_log (referrer_id);
CREATE INDEX idx_event_onboarding_id ON grida_west_referral.event_log (onboarding_id);
CREATE INDEX idx_event_customer_id ON grida_west_referral.event_log (customer_id);


---------------------------------------------------------------------
-- [Admin Customer Wrapper View (for inter schema compat)] --
---------------------------------------------------------------------
CREATE OR REPLACE VIEW grida_west_referral.customer WITH (security_invoker = true) AS
SELECT
  uid,
  name,
  email,
  phone
FROM public.customer;

GRANT SELECT ON grida_west_referral.customer TO anon, authenticated;

-----------------------------------------------------------
-- Function: track  --
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west_referral.track(
    p_campaign_id UUID,
    p_code TEXT,
    p_name TEXT,
    p_data JSONB DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    invitation_record grida_west_referral.invitation%ROWTYPE;
BEGIN
    SELECT * INTO invitation_record FROM grida_west_referral.invitation
    WHERE campaign_id = p_campaign_id AND code = p_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not found';
    END IF;

    INSERT INTO grida_west_referral.event_log (
        campaign_id,
        invitation_id,
        name,
        data
    ) VALUES (
        invitation_record.campaign_id,
        invitation_record.id,
        p_name,
        p_data
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;




---------------------------------------------------------------------
-- [Function: Invite] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west_referral.invite(
    p_campaign_id UUID,
    p_code VARCHAR(256),
    p_next_code VARCHAR(256) DEFAULT NULL
)
RETURNS grida_west_referral.invitation AS $$
DECLARE
    origin_referrer grida_west_referral.referrer%ROWTYPE;
    new_invitation grida_west_referral.invitation%ROWTYPE;
    max_allowed INTEGER;
    current_count INTEGER;
BEGIN
    SELECT * INTO origin_referrer FROM grida_west_referral.referrer WHERE campaign_id = p_campaign_id AND code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'origin referrer not found';
    END IF;

    SELECT max_invitations_per_referrer INTO max_allowed FROM grida_west_referral.campaign WHERE id = origin_referrer.campaign_id;

    IF max_allowed IS NOT NULL THEN
        SELECT COUNT(*) INTO current_count
        FROM grida_west_referral.invitation
        WHERE referrer_id = origin_referrer.id;

        IF current_count >= max_allowed THEN
            RAISE EXCEPTION 'Referrer has reached the maximum allowed invitations (%).', max_allowed;
        END IF;
    END IF;

    INSERT INTO grida_west_referral.invitation (
        campaign_id, referrer_id, code
    )
    VALUES (
        parent_record.campaign_id,
        parent_record.id,
        p_next_code
    )
    RETURNING * INTO new_invitation;

    -- TODO: track
    -- PERFORM grida_west_referral.track(parent_record.series_id, parent_record.code, 'mint');

    RETURN new_invitation;
END;
$$ LANGUAGE plpgsql;


---------------------------------------------------------------------
-- [Function: Claim Invitation] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west_referral.claim(
    p_campaign_id UUID,
    p_code TEXT,
    p_customer_id UUID
)
RETURNS grida_west_referral.invitation AS $$
DECLARE
    invitation_record grida_west_referral.invitation%ROWTYPE;
BEGIN
    SELECT * INTO invitation_record FROM grida_west_referral.invitation 
    WHERE campaign_id = p_campaign_id AND code = p_code FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    IF invitation_record.is_claimed THEN
        RAISE EXCEPTION 'Invitation already claimed';
    END IF;

    -- Update invitation to claimed state
    UPDATE grida_west_referral.invitation
    SET owner_id = p_owner_id,
        is_claimed = true
    WHERE id = invitation_record.id
    RETURNING * INTO invitation_record;

    -- TODO: track
    -- Track the claim event
    -- PERFORM grida_west_referral.track(invitation_record.campaign_id, invitation_record.code, 'claim', jsonb_build_object('owner', p_owner_id));

    RETURN invitation_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-----------------------------------------------------------
-- Function: flag (track challenge)  --
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west_referral.flag(
  p_campaign_id UUID,
  p_invitation_id UUID,
  p_event_name TEXT,
  p_event_data JSONB DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  challenge grida_west_referral.campaign_challenge%ROWTYPE;
  dep_met BOOLEAN;
BEGIN
  -- Step 1–2: check challenge is defined for campaign
  SELECT c.*
  INTO challenge
  FROM grida_west_referral.campaign_challenge c
  JOIN grida_west_referral.campaign_wellknown_event e ON c.event_id = e.id
  WHERE c.campaign_id = p_campaign_id AND e.name = p_event_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event "%" not defined in campaign %', p_event_name, p_campaign_id;
  END IF;

  -- Step 3–4: check dependency (if any)
  IF challenge.depends_on IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM grida_west_referral.onboarding_challenge_flag log
      WHERE log.invitation_id = p_invitation_id
      AND log.campaign_id = p_campaign_id
      AND EXISTS (
        SELECT 1 FROM grida_west_referral.campaign_challenge dep
        WHERE dep.id = challenge.depends_on
      )
    ) INTO dep_met;

    IF NOT dep_met THEN
      RAISE EXCEPTION 'Dependency not met for challenge.';
    END IF;
  END IF;

  -- Step 5: insert event and challenge log
  PERFORM grida_west_referral.track(p_campaign_id, NULL, p_event_name, p_event_data);

  INSERT INTO grida_west_referral.onboarding_challenge_flag (
    campaign_id,
    invitation_id
  ) VALUES (
    p_campaign_id,
    p_invitation_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

