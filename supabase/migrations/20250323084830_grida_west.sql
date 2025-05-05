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



-- 
-- campaign: groups tokens by campaign or program
-- token: universal tokens table with series_id linking tokens to a series
-- token_event: tracks token events (e.g., minting, redemption) (NO RLS)
-- 


-- Enable the "timescaledb" extension
CREATE EXTENSION IF NOT EXISTS timescaledb WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS grida_west;
ALTER SCHEMA "grida_west" OWNER TO "postgres";

GRANT USAGE ON SCHEMA grida_west TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA grida_west TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA grida_west TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA grida_west TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_west GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_west GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_west GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- 
-- 

CREATE TYPE grida_west.token_type AS ENUM ('mintable', 'redeemable');
CREATE TYPE grida_west.participant_role AS ENUM ('host', 'guest');
CREATE TYPE grida_west.campaign_type AS ENUM ('referral');

---------------------------------------------------------------------
-- [Token Series]: groups tokens by campaign or program --
---------------------------------------------------------------------
CREATE TABLE grida_west.campaign (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                               -- Unique series identifier
  project_id BIGINT NOT NULL REFERENCES public.project(id) ON DELETE CASCADE,  -- Project namespace identifier
  type grida_west.campaign_type NOT NULL,                                                 -- Series type (e.g., 'referral')
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),                    -- Series name (e.g., "Spring 2025 Campaign")
  description TEXT,                                                            -- Series description

  is_participant_name_exposed_to_public_dangerously BOOLEAN NOT NULL DEFAULT FALSE,     -- Expose participant name to public
  max_supply_init_for_new_mint_token INTEGER DEFAULT NULL,                                     -- Maximum number of tokens per host

  enabled BOOLEAN NOT NULL DEFAULT true,                                        -- Enable/disable the series
  scheduling_open_at timestamp with time zone null,
  scheduling_close_at timestamp with time zone null,
  scheduling_tz text null,
  public JSONB DEFAULT '{}'::jsonb,                                          -- Flexible additional data for the series

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                               -- Creation timestamp

  CONSTRAINT unique_campaign_id_project_id UNIQUE (id, project_id)
);

-- [rls] campaign:
ALTER TABLE grida_west.campaign enable row level security;
CREATE POLICY "access_based_on_project_membership" ON grida_west.campaign USING (public.rls_project(project_id));

CREATE OR REPLACE VIEW grida_west.campaign_public AS
SELECT
  id,
  type,
  name,
  enabled,
  scheduling_open_at,
  scheduling_close_at,
  scheduling_tz,
  public
FROM grida_west.campaign;

GRANT SELECT ON grida_west.campaign_public TO anon, authenticated, service_role;

-- grida_west rls functions
CREATE OR REPLACE FUNCTION grida_west.rls_campaign(p_campaign_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM grida_west.campaign ts
        WHERE ts.id = p_campaign_id
          AND public.rls_project(ts.project_id)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


---------------------------------------------------------------------
-- [Participant] --
---------------------------------------------------------------------
CREATE TABLE grida_west.participant (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES public.project(id) ON DELETE CASCADE,
    series_id UUID NOT NULL REFERENCES grida_west.campaign(id) ON DELETE CASCADE,
    role grida_west.participant_role NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customer(uid) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB CHECK (jsonb_typeof(metadata) = 'object'),

    CONSTRAINT unique_participant_series_id_role_customer_id unique (series_id, role, customer_id),
    CONSTRAINT fk_participant_series_project FOREIGN KEY (series_id, project_id) REFERENCES grida_west.campaign(id, project_id),
    CONSTRAINT fk_participant_customer_project FOREIGN KEY (customer_id, project_id) REFERENCES public.customer(uid, project_id)
);

ALTER TABLE grida_west.participant enable row level security;
CREATE POLICY "access_based_on_series_project_membership"
ON grida_west.participant
USING (grida_west.rls_campaign(series_id));

CREATE OR REPLACE VIEW grida_west.participant_public AS
SELECT
  p.id,
  p.series_id,
  p.role,
  CASE
    WHEN c.is_participant_name_exposed_to_public_dangerously THEN cust.name
    ELSE NULL
  END AS name
FROM grida_west.participant p
JOIN grida_west.campaign c ON p.series_id = c.id
JOIN public.customer cust ON p.customer_id = cust.uid;
GRANT SELECT ON grida_west.participant_public TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW grida_west.participant_customer WITH (security_barrier=true) AS
SELECT
  p.*,
  c.email,
  c.phone,
  c.name
FROM grida_west.participant p
JOIN public.customer c ON p.customer_id = c.uid
WHERE grida_west.rls_campaign(p.series_id);


---------------------------------------------------------------------
-- [Token] --
---------------------------------------------------------------------
CREATE TABLE grida_west.token (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                                      -- Unique token identifier
  code VARCHAR(256) NOT NULL,                                                                  -- Optional human-friendly code (e.g., PROMO2025)
  secret VARCHAR(256),                                                                -- Optional secret code for minting
  series_id UUID NOT NULL REFERENCES grida_west.campaign(id) ON DELETE CASCADE,   -- Reference to token series (campaign/program)
  parent_id UUID REFERENCES grida_west.token(id) ON DELETE SET NULL,                  -- Parent token reference if minted from another token
  owner_id UUID REFERENCES grida_west.participant(id) ON DELETE SET NULL,             -- Participant reference (optional)
  token_type grida_west.token_type NOT NULL,                                          -- Token type: 'mintable' (can mint new tokens) or 'redeemable' (can be redeemed)
  max_supply INTEGER DEFAULT NULL,                                                    -- Maximum cap for mintable tokens; null for redeemable tokens or unlimited
  count INTEGER NOT NULL DEFAULT 0,                                                   -- Tracks how many times the token has been consumed (minted/redeemed)
-- is_mintable BOOLEAN NOT NULL DEFAULT false,                                         -- True if the token can mint new tokens
  is_claimed BOOLEAN NOT NULL DEFAULT false,                                          -- True if the token has been claimed (owned) by a participant
  is_burned BOOLEAN NOT NULL DEFAULT false,                                           -- True if the token is permanently consumed (burned/spent)

  public JSONB CHECK (jsonb_typeof(public) = 'object'),                               -- Flexible additional data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                                      -- Token creation timestamp

  -- Enforce uniqueness of code within a series
  CONSTRAINT unique_code_per_series UNIQUE (series_id, code),

  CHECK (is_claimed = (owner_id IS NOT NULL)),
  
  -- For redeemable tokens: max_supply must be NULL and count can only be 0 or 1.
  CHECK (
    (token_type = 'redeemable' AND max_supply IS NULL AND count IN (0, 1))
    OR token_type = 'mintable'
  ),
  CHECK (max_supply IS NULL OR count <= max_supply),
  -- For redeemable tokens, if consumed (count = 1), they must be marked as burned.
  CHECK (
    NOT (token_type = 'redeemable' AND count = 1 AND is_burned = false)
  )
);

-- [rls] token:
ALTER TABLE grida_west.token enable row level security;
CREATE POLICY "access_based_on_series_project_membership"
ON grida_west.token
USING (grida_west.rls_campaign(series_id));


---------------------------------------------------------------------
-- [Token Event] --
---------------------------------------------------------------------
CREATE TABLE grida_west.token_event (
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    token_id UUID NOT NULL REFERENCES grida_west.token(id) ON DELETE CASCADE,
    series_id UUID NOT NULL REFERENCES grida_west.campaign(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
    data JSONB DEFAULT NULL CHECK (jsonb_typeof(data) = 'object' AND pg_column_size(data) <= 1024),
    PRIMARY KEY (time, token_id, name)
);

ALTER TABLE grida_west.token_event enable row level security;

-- Convert to hypertable
SELECT create_hypertable('grida_west.token_event', 'time', chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_token_event_token_id ON grida_west.token_event (token_id, time DESC);
CREATE INDEX idx_token_event_series_id ON grida_west.token_event (series_id, time DESC);
CREATE INDEX idx_token_event_name ON grida_west.token_event (name, time DESC);

---------------------------------------------------------------------
-- Trigger Function: Automatically generate code --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west.generate_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.code IS NULL THEN
        NEW.code := substr(md5(NEW.id::text), 1, 8); -- first 8 characters of MD5
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the tokens table (before insert)
CREATE TRIGGER trg_generate_code
BEFORE INSERT ON grida_west.token
FOR EACH ROW
EXECUTE FUNCTION grida_west.generate_code();

---------------------------------------------------------------------
-- Trigger Function: Automatically set series_id from parent token --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west.set_series_from_parent()
RETURNS TRIGGER AS $$
DECLARE
    parent_series UUID;
BEGIN
    IF NEW.parent_id IS NOT NULL AND NEW.series_id IS NULL THEN
        SELECT series_id INTO parent_series 
        FROM grida_west.token 
        WHERE id = NEW.parent_id;
        NEW.series_id := parent_series;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the tokens table (before insert)
CREATE TRIGGER trg_set_series_from_parent
BEFORE INSERT ON grida_west.token
FOR EACH ROW
EXECUTE FUNCTION grida_west.set_series_from_parent();



----------------------------------------------------------------------
-- Trigger Function: Automatically set is_claimed based on owner_id --
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west.set_claimed_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.owner_id IS NOT NULL THEN
        NEW.is_claimed := true;
    ELSE
        NEW.is_claimed := false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the tokens table (before insert or update)
CREATE TRIGGER trg_set_claimed_status
BEFORE INSERT OR UPDATE ON grida_west.token
FOR EACH ROW
EXECUTE FUNCTION grida_west.set_claimed_status();



---------------------------------------------------------------------
--         Trigger Function: track token creation events           --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west.track_token_created_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM grida_west.track(
    NEW.series_id,
    NEW.code,
    'create', 
    -- if parent, include parent_id
    CASE WHEN NEW.parent_id IS NOT NULL THEN jsonb_build_object('from', NEW.parent_id) ELSE NULL END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the tokens table (after insert)
CREATE TRIGGER trigger_track_token_created_event
AFTER INSERT ON grida_west.token
FOR EACH ROW EXECUTE FUNCTION grida_west.track_token_created_event();


---------------------------------------------------------------------
--      Trigger Function: create new token for new participant     --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west.create_token_for_host_participant()
RETURNS TRIGGER AS $$
DECLARE
    new_token grida_west.token%ROWTYPE;
    customer_rec public.customer%ROWTYPE;
    
BEGIN
    IF NEW.role <> 'host' THEN
        RETURN NEW;
    END IF;
    SELECT * INTO customer_rec FROM public.customer WHERE uid = NEW.customer_id;

    INSERT INTO grida_west.token (
        series_id,
        owner_id,
        token_type,
        is_claimed,
        max_supply
    )
    VALUES (
        NEW.series_id,
        NEW.id,
        'mintable',
        true,
        (SELECT max_supply_init_for_new_mint_token FROM grida_west.campaign WHERE id = NEW.series_id)
    )
    RETURNING * INTO new_token;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_token_for_new_participant
AFTER INSERT ON grida_west.participant
FOR EACH ROW
EXECUTE FUNCTION grida_west.create_token_for_host_participant();



-----------------------------------------------------------
-- Function: track  --
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west.track(
    p_series_id UUID,
    p_code TEXT,
    p_name TEXT,
    p_data JSONB DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    token_record grida_west.token%ROWTYPE;
BEGIN
    SELECT * INTO token_record FROM grida_west.token
    WHERE series_id = p_series_id AND code = p_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token not found';
    END IF;

    INSERT INTO grida_west.token_event (
        token_id,
        series_id,
        name,
        data
    ) VALUES (
        token_record.id,
        token_record.series_id,
        p_name,
        p_data
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-------------------------------------------------------------
-- Function: Mint a new token from a parent mintable token --
-------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west.mint_token(
    p_series_id UUID,
    p_code VARCHAR(256),
    p_secret TEXT DEFAULT NULL,
    p_next_code VARCHAR(256) DEFAULT NULL,
    p_next_public JSONB DEFAULT NULL
)
RETURNS grida_west.token AS $$
DECLARE
    parent_record grida_west.token%ROWTYPE;
    new_token grida_west.token%ROWTYPE;
BEGIN
    SELECT * INTO parent_record FROM grida_west.token WHERE series_id = p_series_id AND code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token not found';
    END IF;

    IF parent_record.token_type <> 'mintable' THEN
        RAISE EXCEPTION 'Token is not mintable';
    END IF;

    IF parent_record.public ->> 'secret' IS NOT NULL AND parent_record.public ->> 'secret' <> p_secret THEN
        RAISE EXCEPTION 'Invalid secret provided';
    END IF;

    IF parent_record.max_supply IS NOT NULL AND parent_record.count >= parent_record.max_supply THEN
        RAISE EXCEPTION 'Token has reached its max supply';
    END IF;

    INSERT INTO grida_west.token (
        series_id, parent_id, code, public, token_type
    )
    VALUES (
        parent_record.series_id,
        parent_record.id,
        p_next_code,
        COALESCE(NULLIF(p_next_public, '{}'::jsonb), parent_record.public),
        'redeemable'
    )
    RETURNING * INTO new_token;

    UPDATE grida_west.token
    SET count = count + 1
    WHERE id = parent_record.id
      AND (max_supply IS NULL OR count < max_supply);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token has reached its max supply';
    END IF;

    PERFORM grida_west.track(parent_record.series_id, parent_record.code, 'mint');

    RETURN new_token;
END;
$$ LANGUAGE plpgsql;


-----------------------------------------------------------
-- Function: Claim a token --
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west.claim_token(
    p_series_id UUID,
    p_code TEXT,
    p_owner_id UUID,
    p_secret TEXT DEFAULT NULL
)
RETURNS grida_west.token AS $$
DECLARE
    token_record grida_west.token%ROWTYPE;
BEGIN
    SELECT * INTO token_record FROM grida_west.token 
    WHERE series_id = p_series_id AND code = p_code FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token not found';
    END IF;

    IF token_record.is_claimed THEN
        RAISE EXCEPTION 'Token already claimed';
    END IF;

    IF token_record.public ->> 'secret' IS NOT NULL 
       AND token_record.public ->> 'secret' <> p_secret THEN
        RAISE EXCEPTION 'Invalid secret provided';
    END IF;

    -- Update token to claimed state
    UPDATE grida_west.token
    SET owner_id = p_owner_id,
        is_claimed = true
    WHERE id = token_record.id
    RETURNING * INTO token_record;

    -- Track the claim event
    PERFORM grida_west.track(token_record.series_id, token_record.code, 'claim', jsonb_build_object('owner', p_owner_id));

    RETURN token_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-----------------------------------------------------------
-- Function: Redeem a redeemable token (mark as burned)  --
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west.redeem_token(
    p_token_id UUID
)
RETURNS VOID AS $$
DECLARE
    token_record grida_west.token%ROWTYPE;
BEGIN
    -- Retrieve token record
    SELECT * INTO token_record FROM grida_west.token WHERE id = p_token_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token not found';
    END IF;

    -- Only redeemable tokens can be redeemed
    IF token_record.token_type <> 'redeemable' THEN
        RAISE EXCEPTION 'Token is not redeemable';
    END IF;
    
    -- Reject redemption if token has not been claimed
    IF NOT token_record.is_claimed THEN
        RAISE EXCEPTION 'Token has not been claimed';
    END IF;

    -- Check if token has already been redeemed
    IF token_record.count >= 1 THEN
        RAISE EXCEPTION 'Token has already been redeemed';
    END IF;

    -- Mark the token as redeemed: update count and is_burned flag
    UPDATE grida_west.token
    SET count = 1,
        is_burned = true
    WHERE id = p_token_id;

    PERFORM grida_west.track(token_record.series_id, token_record.code, 'redeem');
END;
$$ LANGUAGE plpgsql;



-----------------------------------------------------------
-- Function: analyze  --
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_west.analyze(
    p_series_id UUID,
    p_names TEXT[] DEFAULT NULL,
    p_time_from TIMESTAMPTZ DEFAULT NULL,
    p_time_to TIMESTAMPTZ DEFAULT NULL,
    p_interval INTERVAL DEFAULT INTERVAL '1 hour'
)
RETURNS TABLE(bucket TIMESTAMPTZ, name TEXT, count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        time_bucket(p_interval, token_event.time) AS bucket,
        token_event.name AS name,
        COUNT(*) AS count
    FROM grida_west.token_event
    WHERE token_event.series_id = p_series_id
        AND (p_names IS NULL OR token_event.name = ANY(p_names))
        AND (p_time_from IS NULL OR token_event.time >= p_time_from)
        AND (p_time_to IS NULL OR token_event.time <= p_time_to)
    GROUP BY bucket, token_event.name
    ORDER BY bucket ASC, count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- analyze bypasses rls, but only can be called by service_role (this is for query efficiency)

REVOKE EXECUTE ON FUNCTION grida_west.analyze FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION grida_west.analyze TO service_role;