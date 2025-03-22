-- Create the schema for the token chain
CREATE SCHEMA IF NOT EXISTS grida_tokens;
ALTER SCHEMA "grida_tokens" OWNER TO "postgres";


GRANT USAGE ON SCHEMA grida_tokens TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA grida_tokens TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA grida_tokens TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA grida_tokens TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_tokens GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_tokens GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_tokens GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- 
-- 

CREATE TYPE grida_tokens.token_type AS ENUM ('mintable', 'redeemable');

-- Token series table: groups tokens by campaign or program
CREATE TABLE grida_tokens.token_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                               -- Unique series identifier
  name VARCHAR(256) NOT NULL,                                                  -- Series name (e.g., "Spring 2025 Campaign")
  metadata JSONB DEFAULT '{}'::jsonb,                                          -- Flexible additional data for the series
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                               -- Creation timestamp
  project_id BIGINT NOT NULL REFERENCES public.project(id) ON DELETE CASCADE,  -- Project namespace identifier
  enabled BOOLEAN NOT NULL DEFAULT true                                        -- Enable/disable the series
);

-- Universal tokens table (crypto-inspired design) with series_id linking tokens to a series
CREATE TABLE grida_tokens.token (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                                      -- Unique token identifier
  series_id UUID NOT NULL REFERENCES grida_tokens.token_series(id) ON DELETE CASCADE,  -- Reference to token series (campaign/program)
  short_id VARCHAR(256),                                                              -- Optional human-friendly code (e.g., PROMO2025)
  parent_id UUID REFERENCES grida_tokens.token(id) ON DELETE SET NULL,                -- Parent token reference if minted from another token
  public JSONB CHECK (jsonb_typeof(public) = 'object'),                                                 -- Flexible additional data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                                      -- Token creation timestamp

  token_type grida_tokens.token_type NOT NULL,                                        -- Token type: 'mintable' (can mint new tokens) or 'redeemable' (can be redeemed)
  next_token_type grida_tokens.token_type,                                            -- Next token type after consumption (optional)
  max_supply INTEGER DEFAULT NULL,                                                    -- Maximum cap for mintable tokens; null for redeemable tokens or unlimited
  count INTEGER NOT NULL DEFAULT 0,                                       -- Tracks how many times the token has been consumed (minted/redeemed)
  is_burned BOOLEAN NOT NULL DEFAULT false,                                           -- True if the token is permanently consumed (burned/spent)

  -- Enforce uniqueness of short_id within a series
  CONSTRAINT unique_short_id_per_series UNIQUE (series_id, short_id),

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


---------------------------------------------------------------------
-- Trigger Function: Automatically generate short_id --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_tokens.generate_short_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.short_id IS NULL THEN
        NEW.short_id := substr(md5(NEW.id::text), 1, 8); -- first 8 characters of MD5
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the tokens table (before insert)
CREATE TRIGGER trg_generate_short_id
BEFORE INSERT ON grida_tokens.token
FOR EACH ROW
EXECUTE FUNCTION grida_tokens.generate_short_id();

---------------------------------------------------------------------
-- Trigger Function: Automatically set series_id from parent token --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_tokens.set_series_from_parent()
RETURNS TRIGGER AS $$
DECLARE
    parent_series UUID;
BEGIN
    IF NEW.parent_id IS NOT NULL AND NEW.series_id IS NULL THEN
        SELECT series_id INTO parent_series 
        FROM grida_tokens.token 
        WHERE id = NEW.parent_id;
        NEW.series_id := parent_series;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the tokens table (before insert)
CREATE TRIGGER trg_set_series_from_parent
BEFORE INSERT ON grida_tokens.token
FOR EACH ROW
EXECUTE FUNCTION grida_tokens.set_series_from_parent();

---------------------------------------------------------
-- Function: Mint a new token from a parent mintable token --
---------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_tokens.mint_token(
    p_parent_id UUID,
    p_token_type grida_tokens.token_type DEFAULT NULL,
    p_short_id VARCHAR(256) DEFAULT NULL,
    p_public JSONB DEFAULT NULL
)
RETURNS grida_tokens.token AS $$
DECLARE
    parent_record grida_tokens.token%ROWTYPE;
    new_token grida_tokens.token%ROWTYPE;
    effective_token_type grida_tokens.token_type;
BEGIN
    SELECT * INTO parent_record FROM grida_tokens.token WHERE id = p_parent_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token not found';
    END IF;

    IF parent_record.token_type <> 'mintable' THEN
        RAISE EXCEPTION 'Token is not mintable';
    END IF;

    IF parent_record.max_supply IS NOT NULL AND parent_record.count >= parent_record.max_supply THEN
        RAISE EXCEPTION 'Token has reached its max supply';
    END IF;

    INSERT INTO grida_tokens.token (
        series_id, parent_id, short_id, public, token_type
    )
    VALUES (
        parent_record.series_id,
        p_parent_id,
        p_short_id,
        COALESCE(NULLIF(p_public, '{}'::jsonb), parent_record.public),
        COALESCE(p_token_type, parent_record.next_token_type, parent_record.token_type)
    )
    RETURNING * INTO new_token;

    UPDATE grida_tokens.token
    SET count = count + 1
    WHERE id = p_parent_id
      AND (max_supply IS NULL OR count < max_supply);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token has reached its max supply';
    END IF;

    RETURN new_token;
END;
$$ LANGUAGE plpgsql;

-----------------------------------------------------------
-- Function: Redeem a redeemable token (mark as burned)  --
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_tokens.redeem_token(
    p_token_id UUID
)
RETURNS VOID AS $$
DECLARE
    token_record grida_tokens.token%ROWTYPE;
BEGIN
    -- Retrieve token record
    SELECT * INTO token_record FROM grida_tokens.token WHERE id = p_token_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token not found';
    END IF;

    -- Only redeemable tokens can be redeemed
    IF token_record.token_type <> 'redeemable' THEN
        RAISE EXCEPTION 'Token is not redeemable';
    END IF;

    -- Check if token has already been redeemed
    IF token_record.count >= 1 THEN
        RAISE EXCEPTION 'Token has already been redeemed';
    END IF;

    -- Mark the token as redeemed: update count and is_burned flag
    UPDATE grida_tokens.token
    SET count = 1,
        is_burned = true
    WHERE id = p_token_id;
END;
$$ LANGUAGE plpgsql;