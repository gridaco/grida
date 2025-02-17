

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "dummy";


ALTER SCHEMA "dummy" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "grida_canvas";


ALTER SCHEMA "grida_canvas" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "grida_commerce";


ALTER SCHEMA "grida_commerce" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "grida_forms";


ALTER SCHEMA "grida_forms" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "grida_forms_secure";


ALTER SCHEMA "grida_forms_secure" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "grida_g11n";


ALTER SCHEMA "grida_g11n" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "grida_sites";


ALTER SCHEMA "grida_sites" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "grida_x_supabase";


ALTER SCHEMA "grida_x_supabase" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "secure";


ALTER SCHEMA "secure" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_hashids" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_jsonschema" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";






CREATE TYPE "grida_commerce"."currency" AS ENUM (
    'AED',
    'AFN',
    'ALL',
    'AMD',
    'ANG',
    'AOA',
    'ARS',
    'AUD',
    'AWG',
    'AZN',
    'BAM',
    'BBD',
    'BDT',
    'BGN',
    'BHD',
    'BIF',
    'BMD',
    'BND',
    'BOB',
    'BRL',
    'BSD',
    'BTC',
    'BTN',
    'BWP',
    'BYN',
    'BZD',
    'CAD',
    'CDF',
    'CHF',
    'CLF',
    'CLP',
    'CNH',
    'CNY',
    'COP',
    'CRC',
    'CUC',
    'CUP',
    'CVE',
    'CZK',
    'DJF',
    'DKK',
    'DOP',
    'DZD',
    'EGP',
    'ERN',
    'ETB',
    'EUR',
    'FJD',
    'FKP',
    'GBP',
    'GEL',
    'GGP',
    'GHS',
    'GIP',
    'GMD',
    'GNF',
    'GTQ',
    'GYD',
    'HKD',
    'HNL',
    'HRK',
    'HTG',
    'HUF',
    'IDR',
    'ILS',
    'IMP',
    'INR',
    'IQD',
    'IRR',
    'ISK',
    'JEP',
    'JMD',
    'JOD',
    'JPY',
    'KES',
    'KGS',
    'KHR',
    'KMF',
    'KPW',
    'KRW',
    'KWD',
    'KYD',
    'KZT',
    'LAK',
    'LBP',
    'LKR',
    'LRD',
    'LSL',
    'LYD',
    'MAD',
    'MDL',
    'MGA',
    'MKD',
    'MMK',
    'MNT',
    'MOP',
    'MRU',
    'MUR',
    'MVR',
    'MWK',
    'MXN',
    'MYR',
    'MZN',
    'NAD',
    'NGN',
    'NIO',
    'NOK',
    'NPR',
    'NZD',
    'OMR',
    'PAB',
    'PEN',
    'PGK',
    'PHP',
    'PKR',
    'PLN',
    'PYG',
    'QAR',
    'RON',
    'RSD',
    'RUB',
    'RWF',
    'SAR',
    'SBD',
    'SCR',
    'SDG',
    'SEK',
    'SGD',
    'SHP',
    'SLL',
    'SOS',
    'SRD',
    'SSP',
    'STN',
    'SVC',
    'SYP',
    'SZL',
    'THB',
    'TJS',
    'TMT',
    'TND',
    'TOP',
    'TRY',
    'TTD',
    'TWD',
    'TZS',
    'UAH',
    'UGX',
    'USD',
    'UYU',
    'UZS',
    'VES',
    'VND',
    'VUV',
    'WST',
    'XAF',
    'XCD',
    'XDR',
    'XOF',
    'XPF',
    'YER',
    'ZAR',
    'ZMW',
    'ZWL'
);


ALTER TYPE "grida_commerce"."currency" OWNER TO "postgres";


CREATE TYPE "grida_commerce"."inventory_level_commit_reason" AS ENUM (
    'admin',
    'initialize',
    'other',
    'order',
    'initialize_by_system'
);


ALTER TYPE "grida_commerce"."inventory_level_commit_reason" OWNER TO "postgres";


CREATE TYPE "grida_commerce"."inventory_management" AS ENUM (
    'none',
    'system'
);


ALTER TYPE "grida_commerce"."inventory_management" OWNER TO "postgres";


CREATE TYPE "grida_commerce"."inventory_policy" AS ENUM (
    'continue',
    'deny'
);


ALTER TYPE "grida_commerce"."inventory_policy" OWNER TO "postgres";


COMMENT ON TYPE "grida_commerce"."inventory_policy" IS 'Inventory policy rather to continue selling after sold out';



CREATE TYPE "grida_forms"."form_block_type" AS ENUM (
    'section',
    'group',
    'field',
    'html',
    'image',
    'video',
    'divider',
    'header',
    'pdf'
);


ALTER TYPE "grida_forms"."form_block_type" OWNER TO "postgres";


COMMENT ON TYPE "grida_forms"."form_block_type" IS 'Form blocks';



CREATE TYPE "grida_forms"."form_field_type" AS ENUM (
    'text',
    'textarea',
    'richtext',
    'tel',
    'url',
    'checkbox',
    'checkboxes',
    'switch',
    'toggle',
    'toggle-group',
    'date',
    'month',
    'week',
    'email',
    'file',
    'image',
    'select',
    'latlng',
    'password',
    'color',
    'radio',
    'country',
    'payment',
    'hidden',
    'signature',
    'number',
    'time',
    'datetime-local',
    'range',
    'search',
    'audio',
    'video',
    'json',
    'canvas'
);


ALTER TYPE "grida_forms"."form_field_type" OWNER TO "postgres";


CREATE TYPE "grida_forms"."form_method" AS ENUM (
    'post',
    'get',
    'dialog'
);


ALTER TYPE "grida_forms"."form_method" OWNER TO "postgres";


CREATE TYPE "grida_forms"."form_response_unknown_field_handling_strategy_type" AS ENUM (
    'ignore',
    'accept',
    'reject'
);


ALTER TYPE "grida_forms"."form_response_unknown_field_handling_strategy_type" OWNER TO "postgres";


CREATE TYPE "grida_forms"."input_autocomplete_type" AS ENUM (
    'off',
    'on',
    'name',
    'honorific-prefix',
    'given-name',
    'additional-name',
    'family-name',
    'honorific-suffix',
    'nickname',
    'email',
    'username',
    'new-password',
    'current-password',
    'one-time-code',
    'organization-title',
    'organization',
    'street-address',
    'shipping',
    'billing',
    'address-line1',
    'address-line2',
    'address-line3',
    'address-level4',
    'address-level3',
    'address-level2',
    'address-level1',
    'country',
    'country-name',
    'postal-code',
    'cc-name',
    'cc-given-name',
    'cc-additional-name',
    'cc-family-name',
    'cc-number',
    'cc-exp',
    'cc-exp-month',
    'cc-exp-year',
    'cc-csc',
    'cc-type',
    'transaction-currency',
    'transaction-amount',
    'language',
    'bday',
    'bday-day',
    'bday-month',
    'bday-year',
    'sex',
    'tel',
    'tel-country-code',
    'tel-national',
    'tel-area-code',
    'tel-local',
    'tel-extension',
    'impp',
    'url',
    'photo',
    'webauthn'
);


ALTER TYPE "grida_forms"."input_autocomplete_type" OWNER TO "postgres";


CREATE TYPE "grida_forms"."response_platform_powered_by" AS ENUM (
    'api',
    'grida_forms',
    'web_client',
    'simulator'
);


ALTER TYPE "grida_forms"."response_platform_powered_by" OWNER TO "postgres";


CREATE TYPE "grida_x_supabase"."sb_postgrest_method" AS ENUM (
    'get',
    'post',
    'delete',
    'patch'
);


ALTER TYPE "grida_x_supabase"."sb_postgrest_method" OWNER TO "postgres";


CREATE TYPE "public"."doctype" AS ENUM (
    'v0_form',
    'v0_site',
    'v0_schema',
    'v0_canvas'
);


ALTER TYPE "public"."doctype" OWNER TO "postgres";


COMMENT ON TYPE "public"."doctype" IS 'grida document type';



CREATE TYPE "public"."language_code" AS ENUM (
    'en',
    'ko',
    'es',
    'de',
    'ja',
    'fr',
    'pt',
    'it',
    'ru',
    'zh',
    'ar',
    'hi',
    'nl'
);


ALTER TYPE "public"."language_code" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dummy"."dummy_t_function"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- This is a dummy function that references dummy1.b1
    PERFORM * FROM dumm1.b1;
    PERFORM * FROM dummy2.b1;

    RAISE NOTICE 'This is a dummy function that references dummy1.b1';
END;
$$;


ALTER FUNCTION "dummy"."dummy_t_function"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."assign_product_id_and_validate_variant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_product_id BIGINT;
BEGIN
    -- Automatically assign product_id from product_variant if not provided
    IF NEW.variant_id IS NOT NULL AND NEW.product_id IS NULL THEN
        SELECT product_id INTO v_product_id FROM grida_commerce.product_variant WHERE id = NEW.variant_id;
        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'No product_id found for variant_id %', NEW.variant_id;
        ELSE
            NEW.product_id := v_product_id;
        END IF;
    END IF;
    
    -- Check if there is already an entry with the same product_id and NULL variant_id
    IF EXISTS (SELECT 1 FROM grida_commerce.inventory_item
               WHERE product_id = NEW.product_id AND variant_id IS NULL AND id <> COALESCE(NEW.id, 0)) THEN
        RAISE EXCEPTION 'Cannot add non-NULL variant_id for product_id % when a NULL variant entry exists', NEW.product_id;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_commerce"."assign_product_id_and_validate_variant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."check_negative_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN

  -- This function is designed to enforce a business rule that prevents
  -- inventory levels from going negative unless explicitly allowed.
  -- A trigger is used instead of a CHECK constraint for several reasons:
  -- 1. Complex Conditional Logic: CHECK constraints are limited in their ability to handle complex conditional logic involving multiple columns.
  -- 2. Detailed Error Messages: Triggers allow for more detailed and custom error messages, including specific error codes, details, and hints.
  -- 3. Flexibility: Triggers provide greater flexibility for future enhancements and more complex business rules that might be added later.

  -- Check if the new available value is negative and the item does not allow negative levels
  IF NEW.available < 0 AND NOT NEW.is_negative_level_allowed THEN
    RAISE EXCEPTION 'Negative inventory level not allowed for item with id %', NEW.id
    USING ERRCODE = 'XX320', -- Custom error code
          DETAIL = 'The Inventory Level is at 0 and configured to not allow negative inventory.',
          HINT = 'Ensure that inventory levels are not reduced below zero or change the configuration to allow negative inventory levels.';
  END IF;

  -- Check if is_negative_level_allowed is being set to false while the level is negative
  IF OLD.is_negative_level_allowed AND NOT NEW.is_negative_level_allowed AND OLD.available < 0 THEN
    RAISE EXCEPTION 'Cannot set is_negative_level_allowed to false for item with id % when inventory level is negative', NEW.id
    USING ERRCODE = 'XX321', -- Custom error code for this specific case
          DETAIL = 'The item has a negative inventory level and cannot be configured to disallow negative inventory.',
          HINT = 'Ensure the inventory level is non-negative before disallowing negative inventory levels.';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_commerce"."check_negative_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."create_product_variant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Insert a new row into product_variant
    INSERT INTO grida_commerce.product_variant (
        store_id,
        product_id,
        sku,
        product_option_combination_id
    )
    VALUES (
        NEW.store_id,
        NEW.product_id,
        'SKU-' || NEW.id, -- Example SKU format
        NEW.id
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_commerce"."create_product_variant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."generate_combinations"("options" "jsonb", "index" integer, "current" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
    result jsonb := '[]'::jsonb;
    value jsonb;
    next_current jsonb;
begin
    if index >= jsonb_array_length(options) then
        return jsonb_insert(result, '{0}', current);
    end if;

    for value in select * from jsonb_array_elements(options->index->'values') loop
        next_current := current || jsonb_build_object(options->index->>'option_id', value);
        result := result || grida_commerce.generate_combinations(options, index + 1, next_current);
    end loop;

    return result;
end;
$$;


ALTER FUNCTION "grida_commerce"."generate_combinations"("options" "jsonb", "index" integer, "current" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."get_inventory_items_with_committed"("p_store_id" bigint) RETURNS TABLE("id" bigint, "created_at" timestamp with time zone, "sku" "text", "store_id" bigint, "product_id" bigint, "variant_id" bigint, "cost" double precision, "available" bigint, "committed" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        ii.id,
        ii.created_at,
        ii.sku,
        ii.store_id,
        ii.product_id,
        ii.variant_id,
        ii.cost,
        ii.available,
        COALESCE(CAST(SUM(CASE WHEN ilc.reason = 'order' AND ilc.diff < 0 THEN -ilc.diff ELSE 0 END) AS bigint), 0) as committed
    FROM
        grida_commerce.inventory_item ii
    LEFT JOIN
        grida_commerce.inventory_level il ON il.inventory_item_id = ii.id
    LEFT JOIN
        grida_commerce.inventory_level_commit ilc ON ilc.inventory_level_id = il.id
    WHERE
        ii.store_id = p_store_id
    GROUP BY
        ii.id, ii.created_at, ii.sku, ii.store_id, ii.product_id, ii.variant_id, ii.cost, ii.available;
END;
$$;


ALTER FUNCTION "grida_commerce"."get_inventory_items_with_committed"("p_store_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."get_inventory_with_committed"("p_store_id" bigint, "p_sku" "text") RETURNS TABLE("id" bigint, "created_at" timestamp with time zone, "sku" "text", "store_id" bigint, "product_id" bigint, "variant_id" bigint, "cost" double precision, "available" bigint, "committed" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        ii.id,
        ii.created_at,
        ii.sku,
        ii.store_id,
        ii.product_id,
        ii.variant_id,
        ii.cost,
        ii.available,
        COALESCE(SUM(CASE WHEN ilc.reason = 'order' AND ilc.diff < 0 THEN -ilc.diff ELSE 0 END), 0) as committed
    FROM
        grida_commerce.inventory_item ii
    LEFT JOIN
        grida_commerce.inventory_level il ON il.inventory_item_id = ii.id
    LEFT JOIN
        grida_commerce.inventory_level_commit ilc ON ilc.inventory_level_id = il.id
    WHERE
        ii.store_id = p_store_id AND ii.sku = p_sku
    GROUP BY
        ii.id, ii.created_at, ii.sku, ii.store_id, ii.product_id, ii.variant_id, ii.cost, ii.available;
END;
$$;


ALTER FUNCTION "grida_commerce"."get_inventory_with_committed"("p_store_id" bigint, "p_sku" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."initialize_inventory_item"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_inventory_item_id BIGINT;
BEGIN
    -- Check if inventory management is set to 'system'
    IF NEW.inventory_management = 'system' THEN
        -- Insert new inventory item
        INSERT INTO grida_commerce.inventory_item (sku, store_id, product_id, variant_id)
        VALUES (NEW.sku, NEW.store_id, NEW.product_id, NEW.id)
        RETURNING id INTO v_inventory_item_id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_commerce"."initialize_inventory_item"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."initialize_inventory_level"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Check if there is no existing inventory_level for this inventory_item
    IF NOT EXISTS (SELECT 1 FROM grida_commerce.inventory_level WHERE inventory_item_id = NEW.id) THEN
        -- Create new inventory level
        INSERT INTO grida_commerce.inventory_level (inventory_item_id, available)
        VALUES (NEW.id, NEW.available);
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_commerce"."initialize_inventory_level"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."initialize_inventory_level_commit_by_system_on_inventory_level_"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Insert into inventory_level_commit table
    INSERT INTO grida_commerce.inventory_level_commit (inventory_level_id, diff, reason)
    VALUES (NEW.id, NEW.available, 'initialize_by_system');

    -- Return the new row to indicate successful insertion
    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_commerce"."initialize_inventory_level_commit_by_system_on_inventory_level_"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."populate_option_map_on_new_option_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Clean up any orphaned product option maps that no longer have any items linked
    -- This happens when all option values associated with a map are deleted
    DELETE FROM grida_commerce.product_option_combination pom
    WHERE pom.product_id = OLD.product_id
    AND NOT EXISTS (
        SELECT 1 FROM grida_commerce.product_option_combination_value_item pomi
        WHERE pomi.option_combination_id = pom.id
    );

    RETURN OLD;
END;
$$;


ALTER FUNCTION "grida_commerce"."populate_option_map_on_new_option_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."populate_option_map_on_new_option_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
    option_values jsonb;
    combination jsonb;
    option_value_ids bigint[];
    v_product_id bigint := new.product_id;
    v_store_id bigint := new.store_id;
    option_names text[];
    option_name text;
begin
    -- Step 1: Delete existing combinations for the given product
    delete from grida_commerce.product_option_combination
    where product_option_combination.product_id = v_product_id;

    -- Step 2: Retrieve the product options and their values for the given product
    with option_values_cte as (
        select pov.option_id,
               jsonb_agg(jsonb_build_object('id', pov.id, 'value', pov.value)) as values
        from grida_commerce.product_option_value pov
        where pov.product_id = v_product_id
        group by pov.option_id
    )
    select jsonb_agg(jsonb_build_object('option_id', option_values_cte.option_id, 'values', option_values_cte.values))
    into option_values
    from option_values_cte;

    -- Step 3: Create all possible combinations of these option values
    if jsonb_array_length(option_values) = 0 then
        return null;
    end if;

    option_value_ids := array(select jsonb_array_elements_text(option_values->0->'values')->>'id'::bigint);
    for i in 1..jsonb_array_length(option_values) loop
        option_names := array_append(option_names, option_values->i->>'option_id');
    end loop;

    -- Call the generate_combinations function
    combination := grida_commerce.generate_combinations(option_values, 0, '{}'::jsonb);

    -- Step 4: Insert these new combinations into the product_option_combination table
    for i in 0..jsonb_array_length(combination) - 1 loop
        insert into grida_commerce.product_option_combination (store_id, product_id, name, option_value_ids)
        values (
            v_store_id,
            v_product_id,
            (select string_agg(value->>'value', '/') from jsonb_array_elements(combination->i) as value),
            array(select (value->>'id')::bigint from jsonb_array_elements(combination->i) as value)
        );
    end loop;

    return null;
end;
$$;


ALTER FUNCTION "grida_commerce"."populate_option_map_on_new_option_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."prevent_inventory_level_commit_diff_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Check if the diff field is being modified
    IF OLD.diff IS DISTINCT FROM NEW.diff THEN
        RAISE EXCEPTION 'Modification of diff is not allowed.';
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_commerce"."prevent_inventory_level_commit_diff_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."update_inventory_item_available"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Calculate the new available sum for the related inventory item
    UPDATE grida_commerce.inventory_item
    SET available = (
        SELECT SUM(available)
        FROM grida_commerce.inventory_level
        WHERE inventory_item_id = NEW.inventory_item_id
    )
    WHERE id = NEW.inventory_item_id;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_commerce"."update_inventory_item_available"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."update_inventory_item_sku"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Check if SKU has been updated
    IF OLD.sku IS DISTINCT FROM NEW.sku THEN
        -- Update SKU in inventory_item
        UPDATE grida_commerce.inventory_item
        SET sku = NEW.sku
        WHERE variant_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_commerce"."update_inventory_item_sku"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."update_inventory_on_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Update the inventory level by subtracting the diff
    UPDATE grida_commerce.inventory_level
    SET available = available - OLD.diff
    WHERE id = OLD.inventory_level_id;

    RETURN OLD;
END;
$$;


ALTER FUNCTION "grida_commerce"."update_inventory_on_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_commerce"."update_inventory_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Check if the reason for the insert is 'initialize_by_system'
    IF NEW.reason <> 'initialize_by_system' THEN
        -- Update the inventory level by adding the diff only if the reason is not 'initialize_by_system'
        UPDATE grida_commerce.inventory_level
        SET available = available + NEW.diff
        WHERE id = NEW.inventory_level_id;
    END IF;

    -- Return the new row
    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_commerce"."update_inventory_on_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms"."add_playground_gist_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.slug := id_encode(NEW.id);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_forms"."add_playground_gist_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms"."auto_increment_attribute_local_index"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$DECLARE
  max_local_index INTEGER;
BEGIN
  -- Get the maximum local_index for the same form_id
  SELECT COALESCE(MAX(local_index), 0) INTO max_local_index
  FROM grida_forms.attribute
  WHERE form_id = NEW.form_id;

  -- Increment local_index for the new row
  NEW.local_index = max_local_index + 1;

  RETURN NEW;
END;$$;


ALTER FUNCTION "grida_forms"."auto_increment_attribute_local_index"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms"."check_general_access"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    is_force_closed boolean;
    is_scheduling_enabled boolean;
    scheduling_open_at timestamp with time zone;
    scheduling_close_at timestamp with time zone;
BEGIN
    -- Retrieve the necessary fields from the form
    SELECT 
        f.is_force_closed,
        f.is_scheduling_enabled,
        f.scheduling_open_at,
        f.scheduling_close_at
    INTO 
        is_force_closed,
        is_scheduling_enabled,
        scheduling_open_at,
        scheduling_close_at
    FROM grida_forms.form f
    WHERE f.id = NEW.form_id;

    -- If the form is not found, raise a "no_data_found" exception
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Form not found for form_id %', NEW.form_id
        USING ERRCODE = '02000'; -- Standard error code for no_data_found
    END IF;

    -- Check if the form is force closed
    IF is_force_closed THEN
        RAISE EXCEPTION 'The form is force closed for form_id %', NEW.form_id
        USING ERRCODE = 'XX211', -- custom error code for force closed
              DETAIL = 'The form is currently marked as force closed and cannot accept responses.',
              HINT = 'Check the form settings to see if force close is enabled.';
    END IF;

    -- Check if the form is closed by scheduler
    IF is_scheduling_enabled THEN
        IF NOW() < scheduling_open_at THEN
            RAISE EXCEPTION 'The form is not open yet by scheduler for form_id %', NEW.form_id
            USING ERRCODE = 'XX232', -- custom error code for form not open yet by scheduler
                  DETAIL = 'The current time is before the scheduled open time for the form.',
                  HINT = 'Wait until the scheduled open time to submit responses.';
        ELSIF NOW() > scheduling_close_at THEN
            RAISE EXCEPTION 'The form is closed by scheduler for form_id %', NEW.form_id
            USING ERRCODE = 'XX231', -- custom error code for form closed by scheduler
                  DETAIL = 'The current time is after the scheduled close time for the form.',
                  HINT = 'Check the form settings to see the scheduled open and close times.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_forms"."check_general_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms"."check_max_responses"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    max_responses bigint;
    current_responses bigint;
    is_max_enabled boolean;
BEGIN
    -- Retrieve the is_max_form_responses_in_total_enabled flag and max_form_responses_in_total value for the form
    SELECT is_max_form_responses_in_total_enabled, max_form_responses_in_total
    INTO is_max_enabled, max_responses
    FROM grida_forms.form
    WHERE id = NEW.form_id;
    
    -- If the form is not found, raise a "no_data_found" exception
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Form not found for form_id %', NEW.form_id
        USING ERRCODE = '02000'; -- Standard error code for no_data_found
    END IF;

    -- If the feature is enabled, check the response count
    IF is_max_enabled THEN
        -- Acquire an advisory lock based on the form_id to ensure uniqueness within each form
        PERFORM pg_advisory_xact_lock(hashtext(NEW.form_id::text));

        -- Get the current response count for the form
        SELECT COUNT(*)
        INTO current_responses
        FROM grida_forms.response
        WHERE form_id = NEW.form_id;

        -- Compare current responses with the maximum allowed
        IF current_responses >= max_responses THEN
            RAISE EXCEPTION 'Maximum number of responses reached for form_id %', NEW.form_id
            USING ERRCODE = 'XX221', -- Custom error code for max responses reached
                  DETAIL = 'The number of responses has reached the allowed maximum.',
                  HINT = 'Consider increasing the maximum allowed responses or disabling the limit.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_forms"."check_max_responses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms"."core_check_max_responses"("p_form_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    max_responses bigint;
    current_responses bigint;
    is_max_enabled boolean;
BEGIN
    -- Retrieve the is_max_form_responses_in_total_enabled flag and max_form_responses_in_total value for the form
    SELECT is_max_form_responses_in_total_enabled, max_form_responses_in_total
    INTO is_max_enabled, max_responses
    FROM grida_forms.form
    WHERE id = p_form_id;
    
    -- If the form is not found, raise a "no_data_found" exception
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Form not found for form_id %', p_form_id
        USING ERRCODE = '02000'; -- Standard error code for no_data_found
    END IF;

    -- If the feature is enabled, check the response count
    IF is_max_enabled THEN
        -- Acquire an advisory lock based on the form_id to ensure uniqueness within each form
        PERFORM pg_advisory_xact_lock(hashtext(p_form_id::text));

        -- Get the current response count for the form
        SELECT COUNT(*)
        INTO current_responses
        FROM grida_forms.response
        WHERE form_id = p_form_id;

        -- Compare current responses with the maximum allowed
        IF current_responses >= max_responses THEN
            RAISE EXCEPTION 'Maximum number of responses reached for form_id %', p_form_id
            USING ERRCODE = 'XX221', -- Custom error code for max responses reached
                  DETAIL = 'The number of responses has reached the allowed maximum.',
                  HINT = 'Consider increasing the maximum allowed responses or disabling the limit.';
        END IF;
    END IF;
END;
$$;


ALTER FUNCTION "grida_forms"."core_check_max_responses"("p_form_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms"."ping_form_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Update the updated_at column in the form table
    UPDATE grida_forms.form
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.form_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_forms"."ping_form_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms"."rpc_check_max_responses"("form_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    PERFORM grida_forms.core_check_max_responses(form_id);
END;
$$;


ALTER FUNCTION "grida_forms"."rpc_check_max_responses"("form_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms"."set_response_session_field_value"("session_id" "uuid", "key" "text", "value" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Start a transaction block
    BEGIN
        -- Lock the row to prevent concurrent updates
        PERFORM 1 FROM grida_forms.response_session WHERE id = session_id FOR UPDATE;

        -- Ensure raw is not NULL
        UPDATE grida_forms.response_session
        SET raw = COALESCE(raw, '{}'::jsonb)
        WHERE id = session_id;

        -- Update the raw field
        UPDATE grida_forms.response_session
        SET raw = jsonb_set(raw, ARRAY[key], value, true)
        WHERE id = session_id;
    END;
END;
$$;


ALTER FUNCTION "grida_forms"."set_response_session_field_value"("session_id" "uuid", "key" "text", "value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms"."trg_check_max_responses"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    PERFORM grida_forms.core_check_max_responses(NEW.form_id);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_forms"."trg_check_max_responses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms"."update_form_response_local_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    _local_index bigint;
BEGIN
    -- Acquire an advisory lock based on the form_id to ensure uniqueness within each form
    PERFORM pg_advisory_xact_lock(hashtext(NEW.form_id::text));

    -- Check if the local_index is 0 (treated as null)
    IF NEW.local_index = 0 THEN
        -- Calculate the next local_index value for the specific form_id
        SELECT COALESCE(MAX(local_index) + 1, 1) INTO _local_index
        FROM grida_forms.response
        WHERE form_id = NEW.form_id
          AND id <> NEW.id; -- Exclude the current row

        -- Set the new local_index and local_id
        NEW.local_index := _local_index;
    ELSE
        -- If local_index is not 0, use the existing local_index
        _local_index := NEW.local_index;
    END IF;

    -- Always update the local_id based on the (possibly new) local_index
    NEW.local_id := id_encode(_local_index);

    RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_forms"."update_form_response_local_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms"."update_response_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- this is a trigger function called form child tables of response, where it has response_id as `response_id`
  UPDATE grida_forms.response
  SET updated_at = NOW()
  WHERE id = NEW.response_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "grida_forms"."update_response_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms_secure"."create_secret_connection_supabase_service_key"("p_supabase_project_id" bigint, "p_secret" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    encryption_key_id uuid;
    secret_id uuid;
    secret_name text;
    description text;
BEGIN
    -- Step 1: Fetch the encryption key ID using the fetch_key_id function
    SELECT secure.fetch_key_id('USER_PROVIDED_3RDPARTY_SECRETS') INTO encryption_key_id;

    -- Step 2: Set name and description based on connection_id
    secret_name := 'grida_x_supabase__supabase_project_service_key__' || p_supabase_project_id;
    description := 'USER_PROVIDED_3RDPARTY_SECRETS supabase service key for grida_x_supabase.supabase_project with id ' || p_supabase_project_id;

    -- Step 3: Use the id in the vault.create_secret function and retrieve the secret id
    SELECT vault.create_secret(p_secret, secret_name, description, encryption_key_id) INTO secret_id;

    -- Step 4: Update grida_x_supabase.supabase_project#sb_service_key_id column with the new secret id
    UPDATE grida_x_supabase.supabase_project
    SET sb_service_key_id = secret_id
    WHERE id = p_supabase_project_id;

    -- Return the secret id
    RETURN secret_id;
END $$;


ALTER FUNCTION "grida_forms_secure"."create_secret_connection_supabase_service_key"("p_supabase_project_id" bigint, "p_secret" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_forms_secure"."reveal_secret_connection_supabase_service_key"("p_supabase_project_id" bigint) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    secret_id uuid;
    secret text;
BEGIN
    -- Step 1: Retrieve the secret ID from grida_x_supabase.supabase_project
    SELECT sb_service_key_id INTO secret_id
    FROM grida_x_supabase.supabase_project
    WHERE id = p_supabase_project_id;

    -- Step 2: Retrieve the decrypted secret from vault.decrypted_secrets
    SELECT decrypted_secret INTO secret
    FROM vault.decrypted_secrets
    WHERE id = secret_id;

    -- Return the decrypted secret
    RETURN secret;
END $$;


ALTER FUNCTION "grida_forms_secure"."reveal_secret_connection_supabase_service_key"("p_supabase_project_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "grida_x_supabase"."delete_vault_secret_on_supabase_project_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Delete the vault secret associated with the deleted project
    DELETE FROM vault.secrets WHERE id = OLD.sb_service_key_id;
    RETURN OLD;
END;
$$;


ALTER FUNCTION "grida_x_supabase"."delete_vault_secret_on_supabase_project_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_initial_organization_member"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Insert the new organization's owner as the first member of the organization
  INSERT INTO public.organization_member (organization_id, user_id)
  VALUES (NEW.id, NEW.owner_id);

  -- Return the new row to indicate success
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."add_initial_organization_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_document_on_form_document_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    DELETE FROM public.document WHERE id = OLD.id;
    RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."delete_document_on_form_document_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_combinations"("product_id" bigint, "option_value_combinations" bigint[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    combination BIGINT[];
BEGIN
    -- Initialize combination array
    combination := ARRAY[]::BIGINT[];

    -- Start the recursive function to generate combinations
    PERFORM generate_combination_recursive(product_id, option_value_combinations, combination, 1);
END;
$$;


ALTER FUNCTION "public"."generate_combinations"("product_id" bigint, "option_value_combinations" bigint[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_combinations"("option_ids" bigint[], "product_id" bigint, "store_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  option_values bigint[];
  option_values_list bigint[][];
  i int;
BEGIN
  -- Initialize the list of option values for each option
  option_values_list := '{}';

  -- Get all option values for each option
  FOREACH i IN ARRAY option_ids
  LOOP
    SELECT array_agg(pov.id) INTO option_values
    FROM grida_commerce.product_option_value pov
    WHERE pov.option_id = i;
    option_values_list := array_append(option_values_list, option_values);
  END LOOP;

  -- Generate the combinations
  PERFORM generate_combinations_recursive(option_values_list, '{}', product_id, store_id);

END;
$$;


ALTER FUNCTION "public"."generate_combinations"("option_ids" bigint[], "product_id" bigint, "store_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_organizations_for_user"("user_id" "uuid") RETURNS SETOF bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $_$
  SELECT organization_id 
  FROM public.organization_member 
  WHERE user_id = $1
$_$;


ALTER FUNCTION "public"."get_organizations_for_user"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_projects_for_user"("user_id" "uuid") RETURNS SETOF bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $_$
  SELECT DISTINCT project.id
  FROM public.project
  JOIN public.organization ON organization.id = project.organization_id
  JOIN public.organization_member ON organization_member.organization_id = organization.id
  WHERE organization_member.user_id = $1
$_$;


ALTER FUNCTION "public"."get_projects_for_user"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  email_prefix text;
begin
  -- Check if email is not null
  if new.email is null then
    raise exception 'Email cannot be null for user ID: %', new.id;
  end if;

  -- Extract the prefix of the email before '@'
  email_prefix := split_part(new.email, '@', 1);

  -- Insert a new row into the public.user_profile table
  insert into public.user_profile (uid, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', email_prefix)
  );

  return new;
exception
  when others then
    raise notice 'An error occurred while inserting user profile for user ID %: %', new.id, sqlerrm;
    return null; -- This allows the user creation to proceed even if the profile insert fails
end;
$$;


ALTER FUNCTION "public"."handle_new_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_asset"("p_asset_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.asset a
        WHERE a.id = p_asset_id
          AND public.rls_document(a.document_id)
    );
END;$$;


ALTER FUNCTION "public"."rls_asset"("p_asset_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_document"("p_document_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.document d
        WHERE d.id = p_document_id
          AND public.rls_project(d.project_id)
    );
END;
$$;


ALTER FUNCTION "public"."rls_document"("p_document_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_manifest"("p_manifest_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM grida_g11n.manifest m
        WHERE m.id = p_manifest_id 
          AND public.rls_project(m.project_id)
    );
END;
$$;


ALTER FUNCTION "public"."rls_manifest"("p_manifest_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_organization"("p_organization_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM organization_member om
        WHERE om.organization_id = p_organization_id AND om.user_id = auth.uid()
    );
END;
$$;


ALTER FUNCTION "public"."rls_organization"("p_organization_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_project"("project_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM organization_member om
        JOIN project p ON om.organization_id = p.organization_id
        WHERE p.id = project_id AND om.user_id = auth.uid()
    );
END;$$;


ALTER FUNCTION "public"."rls_project"("project_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_organization_initial_display_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.display_name IS NULL OR NEW.display_name = '' THEN
        NEW.display_name := NEW.name;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_organization_initial_display_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_project_ref_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Check if ref_id is not already set
    IF NEW.ref_id IS NULL THEN
        -- Generate the ref_id using id_encode on the ID of the newly inserted row
        NEW.ref_id := id_encode(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_project_ref_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_asset_object_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Check if the bucket is 'assets' or 'assets-public' and update accordingly
  if (new.bucket_id = 'assets' or new.bucket_id = 'assets-public') then
    update public.asset
    set object_id = new.id
    where id::text = new.name
    and (
      (new.bucket_id = 'assets' and is_public = false)
      or
      (new.bucket_id = 'assets-public' and is_public = true)
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."update_asset_object_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."workspace_documents"("p_organization_id" bigint) RETURNS TABLE("id" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "doctype" "public"."doctype", "project_id" bigint, "title" "text", "form_id" "uuid", "organization_id" bigint, "has_connection_supabase" boolean, "responses" bigint, "max_responses" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id AS id,
        d.created_at AS created_at,
        d.updated_at AS updated_at,
        d.doctype AS doctype,
        d.project_id AS project_id,
        d.title AS title,
        fd.form_id AS form_id,
        p.organization_id AS organization_id,
        cs.id IS NOT NULL AS has_connection_supabase,
        COALESCE((SELECT COUNT(*) FROM grida_forms.response r WHERE r.form_id = fd.form_id), 0) AS responses,
        f.max_form_responses_in_total AS max_responses
        -- Additional selects for v0_site
        --, vs.id AS site_id
        --, vs.name AS site_name
        --, vs.url AS site_url
        -- Add other site-specific columns here
    FROM 
        public.document d
    LEFT JOIN 
        grida_forms.form_document fd ON d.id = fd.id
    LEFT JOIN 
        public.project p ON d.project_id = p.id
    LEFT JOIN 
        grida_forms.connection_supabase cs ON fd.form_id = cs.form_id
    LEFT JOIN 
        grida_forms.form f ON fd.form_id = f.id
    -- LEFT JOIN v0_site vs ON d.id = vs.document_id
    WHERE 
        p.organization_id = p_organization_id;
END;
$$;


ALTER FUNCTION "public"."workspace_documents"("p_organization_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "secure"."fetch_key_id"("p_key_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    key_id uuid;
BEGIN
    SELECT id INTO key_id FROM pgsodium.key WHERE name = p_key_name;
    RETURN key_id;
END $$;


ALTER FUNCTION "secure"."fetch_key_id"("p_key_name" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "dummy"."order_items" (
    "order_id" integer NOT NULL,
    "product_id" integer NOT NULL,
    "quantity" integer NOT NULL
);


ALTER TABLE "dummy"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "dummy"."orders" (
    "order_id" integer NOT NULL,
    "order_date" "date" NOT NULL
);


ALTER TABLE "dummy"."orders" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "dummy"."orders_order_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "dummy"."orders_order_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "dummy"."orders_order_id_seq" OWNED BY "dummy"."orders"."order_id";



CREATE TABLE IF NOT EXISTS "dummy"."products" (
    "product_id" integer NOT NULL,
    "product_name" character varying(100) NOT NULL,
    "price" numeric(10,2) NOT NULL
);


ALTER TABLE "dummy"."products" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "dummy"."products_product_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "dummy"."products_product_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "dummy"."products_product_id_seq" OWNED BY "dummy"."products"."product_id";



CREATE TABLE IF NOT EXISTS "dummy"."shipments" (
    "shipment_id" integer NOT NULL,
    "order_id" integer NOT NULL,
    "product_id" integer NOT NULL,
    "shipped_date" "date" NOT NULL
);


ALTER TABLE "dummy"."shipments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "dummy"."shipments_shipment_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "dummy"."shipments_shipment_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "dummy"."shipments_shipment_id_seq" OWNED BY "dummy"."shipments"."shipment_id";



CREATE TABLE IF NOT EXISTS "dummy"."t1" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "dummy"."t1" OWNER TO "postgres";


ALTER TABLE "dummy"."t1" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "dummy"."t1_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "dummy"."t2" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "t1" bigint
);


ALTER TABLE "dummy"."t2" OWNER TO "postgres";


ALTER TABLE "dummy"."t2" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "dummy"."t2_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_canvas"."canvas_document" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data" "jsonb" NOT NULL,
    "id" "uuid" NOT NULL
);


ALTER TABLE "grida_canvas"."canvas_document" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "grida_commerce"."inventory_item" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sku" "text" NOT NULL,
    "store_id" bigint NOT NULL,
    "product_id" bigint,
    "variant_id" bigint,
    "cost" double precision,
    "available" bigint DEFAULT '0'::bigint NOT NULL,
    "is_negative_level_allowed" boolean DEFAULT true NOT NULL,
    CONSTRAINT "chk_no_negative_inventory_when_disallowed" CHECK (("is_negative_level_allowed" OR ("available" >= 0)))
);


ALTER TABLE "grida_commerce"."inventory_item" OWNER TO "postgres";


COMMENT ON TABLE "grida_commerce"."inventory_item" IS 'SKU, optionally mapped to product variant';



COMMENT ON COLUMN "grida_commerce"."inventory_item"."cost" IS 'COGS';



COMMENT ON COLUMN "grida_commerce"."inventory_item"."available" IS 'cannot be directly modified. this is a sum of available accross all inventory level associated with it.';



COMMENT ON COLUMN "grida_commerce"."inventory_item"."is_negative_level_allowed" IS 'rather to allow ''available'' going below 0.';



COMMENT ON CONSTRAINT "chk_no_negative_inventory_when_disallowed" ON "grida_commerce"."inventory_item" IS 'Ensures that is_negative_level_allowed cannot be set to FALSE when available is negative. This duplicates logic in the trigger function to provide an additional layer of enforcement.';



ALTER TABLE "grida_commerce"."inventory_item" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_commerce"."inventory_item_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_commerce"."inventory_level" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inventory_item_id" bigint NOT NULL,
    "available" bigint DEFAULT '0'::bigint NOT NULL
);


ALTER TABLE "grida_commerce"."inventory_level" OWNER TO "postgres";


COMMENT ON TABLE "grida_commerce"."inventory_level" IS 'inventory level tracking table';



COMMENT ON COLUMN "grida_commerce"."inventory_level"."available" IS 'this should not be directly modified. use inventory_level commit to adjust the available value';



CREATE TABLE IF NOT EXISTS "grida_commerce"."inventory_level_commit" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inventory_level_id" bigint NOT NULL,
    "diff" bigint,
    "reason" "grida_commerce"."inventory_level_commit_reason" DEFAULT 'other'::"grida_commerce"."inventory_level_commit_reason" NOT NULL
);


ALTER TABLE "grida_commerce"."inventory_level_commit" OWNER TO "postgres";


COMMENT ON TABLE "grida_commerce"."inventory_level_commit" IS 'inventory level committing action / log (inserting, deleting this will effect inventory_level)';



COMMENT ON COLUMN "grida_commerce"."inventory_level_commit"."diff" IS 'diff to commit. automatically calculates if non provided with `after` either one must be provided. cannot be modified once inserted';



ALTER TABLE "grida_commerce"."inventory_level_commit" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_commerce"."inventory_level_commit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "grida_commerce"."inventory_level" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_commerce"."inventory_level_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_commerce"."product_option" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "grida_commerce"."product_option" OWNER TO "postgres";


COMMENT ON TABLE "grida_commerce"."product_option" IS 'option. product option is a option of a product, e.g. size. product can have multiple options and each option can have multiple option value. for instance, option color [white (value), blue (value)] and option size [small (value), medum (value)] will result combinations of ["white / small", "white / medium", "blue / small", "blue / medium"].';



ALTER TABLE "grida_commerce"."product_option" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_commerce"."option_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_commerce"."product_option_value" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "option_id" bigint NOT NULL,
    "value" "text" NOT NULL,
    "label" "text"
);


ALTER TABLE "grida_commerce"."product_option_value" OWNER TO "postgres";


COMMENT ON TABLE "grida_commerce"."product_option_value" IS 'value of product options, e.g. if product_option is color, this can be ''white'', ''blue'', ''red''';



ALTER TABLE "grida_commerce"."product_option_value" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_commerce"."option_value_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_commerce"."product" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "body_html" "text",
    "sku" "text",
    CONSTRAINT "product_sku_check" CHECK ((("length"("sku") >= 8) AND ("sku" !~~ '% %'::"text")))
);


ALTER TABLE "grida_commerce"."product" OWNER TO "postgres";


COMMENT ON TABLE "grida_commerce"."product" IS 'the product. contains description about the product.';



COMMENT ON COLUMN "grida_commerce"."product"."sku" IS 'a virtual and unique sku for product or product group (even it has a variant and each sku, this should be unique by its own if present)';



ALTER TABLE "grida_commerce"."product" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_commerce"."product_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_commerce"."product_option_combination" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "name" "text",
    "option_value_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL
);


ALTER TABLE "grida_commerce"."product_option_combination" OWNER TO "postgres";


COMMENT ON TABLE "grida_commerce"."product_option_combination" IS 'possible definitions of product variant by options and values. since we want strict control, we save the option value in different join table, rather than saving values explicitly. this represents a single possible combination of a product variant, e.g. "white / small" where white is a value of color option and small is a value of size option.';



CREATE TABLE IF NOT EXISTS "grida_commerce"."product_option_combination_value_item" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "option_combination_id" bigint NOT NULL,
    "option_id" bigint NOT NULL,
    "option_value_id" bigint NOT NULL
);


ALTER TABLE "grida_commerce"."product_option_combination_value_item" OWNER TO "postgres";


COMMENT ON TABLE "grida_commerce"."product_option_combination_value_item" IS 'item value used to describe product option combination (variant). this is a join table for product option combination to describe what combinations of option value the combination is holding.';



ALTER TABLE "grida_commerce"."product_option_combination" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_commerce"."product_option_map_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "grida_commerce"."product_option_combination_value_item" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_commerce"."product_option_map_item_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_commerce"."product_variant" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "compare_at_price" double precision,
    "price" double precision,
    "sku" "text" NOT NULL,
    "product_option_combination_id" bigint,
    "inventory_management" "grida_commerce"."inventory_management" DEFAULT 'system'::"grida_commerce"."inventory_management",
    "inventory_policy" "grida_commerce"."inventory_policy" DEFAULT 'continue'::"grida_commerce"."inventory_policy"
);


ALTER TABLE "grida_commerce"."product_variant" OWNER TO "postgres";


COMMENT ON TABLE "grida_commerce"."product_variant" IS 'variants of product, determined by product option combinations by product options and its values. it is 1:1 mapped to product_option_combination, this mainly holds the product data and used for inventory tracking, relying the constraints and query on product_option_combination. E.g. "white", "white / small", "white / small / 128GB"';



COMMENT ON COLUMN "grida_commerce"."product_variant"."sku" IS 'if non provided by user, this will use the id of combination';



ALTER TABLE "grida_commerce"."product_variant" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_commerce"."product_variant_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_commerce"."store" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" bigint NOT NULL,
    "currency" "grida_commerce"."currency" DEFAULT 'USD'::"grida_commerce"."currency" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "grida_commerce"."store" OWNER TO "postgres";


COMMENT ON TABLE "grida_commerce"."store" IS 'store, a master unit of collection of products. it is used for configuring access, currency and sku constraints and 1st/3rd party app connections.';



ALTER TABLE "grida_commerce"."store" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_commerce"."store_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_forms"."attribute" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "label" "text",
    "placeholder" "text",
    "help_text" "text",
    "description" "text",
    "pattern" "jsonb",
    "minlength" bigint,
    "maxlength" bigint,
    "required" boolean DEFAULT false NOT NULL,
    "min" real,
    "max" real,
    "type" "grida_forms"."form_field_type" DEFAULT 'text'::"grida_forms"."form_field_type" NOT NULL,
    "form_id" "uuid" NOT NULL,
    "data" "jsonb",
    "accept" "text",
    "multiple" boolean,
    "autocomplete" "grida_forms"."input_autocomplete_type"[],
    "local_index" integer DEFAULT 0 NOT NULL,
    "is_array" boolean DEFAULT false NOT NULL,
    "step" real,
    "storage" "jsonb",
    "reference" "jsonb",
    "readonly" boolean DEFAULT false NOT NULL,
    "v_value" "jsonb",
    CONSTRAINT "storage_schema_check" CHECK ("extensions"."jsonb_matches_schema"('{
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "type": { "type": "string", "enum": ["grida", "x-supabase", "x-s3"] },
                "bucket": { "type": "string" },
                "path": { "type": "string" },
                "mode": { "type": "string", "enum": ["direct", "staged"] }
            },
            "required": ["type", "bucket", "path", "mode"]
        }'::"json", "storage"))
);


ALTER TABLE "grida_forms"."attribute" OWNER TO "postgres";


COMMENT ON COLUMN "grida_forms"."attribute"."min" IS 'only supports numeric';



COMMENT ON COLUMN "grida_forms"."attribute"."max" IS 'only supports numeric';



COMMENT ON COLUMN "grida_forms"."attribute"."local_index" IS 'column sorting index';



COMMENT ON COLUMN "grida_forms"."attribute"."is_array" IS 'rather to define as array';



COMMENT ON COLUMN "grida_forms"."attribute"."step" IS 'html5 standard `step` attribute';



COMMENT ON COLUMN "grida_forms"."attribute"."storage" IS 'storage config';



CREATE TABLE IF NOT EXISTS "grida_forms"."connection_commerce_store" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" bigint NOT NULL,
    "form_id" "uuid" NOT NULL,
    "store_id" bigint NOT NULL
);


ALTER TABLE "grida_forms"."connection_commerce_store" OWNER TO "postgres";


COMMENT ON TABLE "grida_forms"."connection_commerce_store" IS 'Grida Commerce Store integration';



CREATE TABLE IF NOT EXISTS "grida_forms"."connection_supabase" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "main_supabase_table_id" bigint,
    "supabase_project_id" bigint NOT NULL
);


ALTER TABLE "grida_forms"."connection_supabase" OWNER TO "postgres";


ALTER TABLE "grida_forms"."connection_supabase" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_forms"."connection_supabase_project_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_forms"."form" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" DEFAULT 'Untitled'::"text" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "description" "text",
    "project_id" bigint NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_form_page_id" "uuid",
    "unknown_field_handling_strategy" "grida_forms"."form_response_unknown_field_handling_strategy_type" DEFAULT 'ignore'::"grida_forms"."form_response_unknown_field_handling_strategy_type" NOT NULL,
    "max_form_responses_by_customer" bigint,
    "max_form_responses_in_total" bigint,
    "is_max_form_responses_by_customer_enabled" boolean DEFAULT false NOT NULL,
    "is_max_form_responses_in_total_enabled" boolean DEFAULT false NOT NULL,
    "is_force_closed" boolean DEFAULT false NOT NULL,
    "is_scheduling_enabled" boolean DEFAULT false NOT NULL,
    "scheduling_open_at" timestamp with time zone,
    "scheduling_close_at" timestamp with time zone,
    "scheduling_tz" "text",
    "schema_id" "uuid",
    "name" "text" DEFAULT 'untitled'::"text" NOT NULL,
    CONSTRAINT "form_name_check" CHECK (("length"("name") > 0)),
    CONSTRAINT "form_title_check" CHECK (("length"("title") > 0))
);


ALTER TABLE "grida_forms"."form" OWNER TO "postgres";


COMMENT ON TABLE "grida_forms"."form" IS 'the form meta object';



COMMENT ON COLUMN "grida_forms"."form"."description" IS 'description of this form that will not be visible to users';



COMMENT ON COLUMN "grida_forms"."form"."scheduling_tz" IS 'scheduling timezone';



COMMENT ON COLUMN "grida_forms"."form"."schema_id" IS 'id to a schema (schema_document) when null, the table is used in a hidden context.';



CREATE TABLE IF NOT EXISTS "grida_forms"."form_block" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "form_field_id" "uuid",
    "local_index" integer DEFAULT 0 NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid",
    "type" "grida_forms"."form_block_type" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "title_html" "text",
    "description_html" "text",
    "src" "text",
    "form_page_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "body_html" "text",
    "v_hidden" "jsonb" DEFAULT 'false'::"jsonb"
);


ALTER TABLE "grida_forms"."form_block" OWNER TO "postgres";


COMMENT ON TABLE "grida_forms"."form_block" IS 'form blocks for visual editor';



COMMENT ON COLUMN "grida_forms"."form_block"."title_html" IS 'user facing title of the block - overrides field label if provided';



COMMENT ON COLUMN "grida_forms"."form_block"."description_html" IS 'User facing description';



COMMENT ON COLUMN "grida_forms"."form_block"."src" IS 'src if image or video block';



COMMENT ON COLUMN "grida_forms"."form_block"."v_hidden" IS 'logical hidden descriptor (json logic)';



ALTER TABLE "grida_forms"."connection_commerce_store" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_forms"."form_connection_store_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_forms"."form_document" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "__name" "text" DEFAULT 'Untitled'::"text" NOT NULL,
    "background" "jsonb",
    "stylesheet" "jsonb",
    "is_redirect_after_response_uri_enabled" boolean DEFAULT false NOT NULL,
    "redirect_after_response_uri" "text",
    "lang" "public"."language_code" DEFAULT 'en'::"public"."language_code" NOT NULL,
    "is_powered_by_branding_enabled" boolean DEFAULT true NOT NULL,
    "is_ending_page_enabled" boolean DEFAULT false NOT NULL,
    "ending_page_template_id" "text",
    "ending_page_i18n_overrides" "jsonb",
    "method" "grida_forms"."form_method" DEFAULT 'post'::"grida_forms"."form_method" NOT NULL,
    "project_id" bigint NOT NULL,
    "g11n_manifest_id" bigint,
    "start_page" "jsonb"
);


ALTER TABLE "grida_forms"."form_document" OWNER TO "postgres";


COMMENT ON TABLE "grida_forms"."form_document" IS 'form page';



COMMENT ON COLUMN "grida_forms"."form_document"."id" IS 'document id';



COMMENT ON COLUMN "grida_forms"."form_document"."__name" IS 'legacy - drop me';



CREATE TABLE IF NOT EXISTS "grida_forms"."form_template" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "preview_path" "text" NOT NULL
);


ALTER TABLE "grida_forms"."form_template" OWNER TO "postgres";


ALTER TABLE "grida_forms"."form_template" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_forms"."form_template_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_forms"."gist" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data" "jsonb",
    "slug" "text",
    "prompt" "text",
    "is_public" boolean DEFAULT true NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "title" "text"
);


ALTER TABLE "grida_forms"."gist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "grida_forms"."optgroup" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "form_field_id" "uuid" NOT NULL,
    "index" smallint DEFAULT '0'::smallint NOT NULL,
    "label" "text" NOT NULL,
    "disabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "grida_forms"."optgroup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "grida_forms"."option" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "value" "text" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "form_field_id" "uuid" NOT NULL,
    "form_id" "uuid" NOT NULL,
    "index" bigint DEFAULT '0'::bigint NOT NULL,
    "disabled" boolean,
    "src" "text",
    "optgroup_id" "uuid"
);


ALTER TABLE "grida_forms"."option" OWNER TO "postgres";


ALTER TABLE "grida_forms"."gist" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_forms"."playground_gist_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_forms"."relation_view" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "relation_id" "uuid" NOT NULL
);


ALTER TABLE "grida_forms"."relation_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "grida_forms"."response" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "ip" "text",
    "browser" "text",
    "x_referer" "text",
    "x_useragent" "text",
    "platform_powered_by" "grida_forms"."response_platform_powered_by",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "raw" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "local_index" bigint DEFAULT '0'::bigint NOT NULL,
    "local_id" "text",
    "x_ipinfo" "jsonb",
    "geo" "jsonb",
    "session_id" "uuid"
);


ALTER TABLE "grida_forms"."response" OWNER TO "postgres";


COMMENT ON COLUMN "grida_forms"."response"."local_index" IS 'local_index, or idx, used to display as #1. for instance, #293.';



COMMENT ON COLUMN "grida_forms"."response"."local_id" IS 'local_id, encoded via local_index';



COMMENT ON COLUMN "grida_forms"."response"."x_ipinfo" IS 'ipinfo (via ipinfo.io)';



COMMENT ON COLUMN "grida_forms"."response"."geo" IS 'geodata';



CREATE TABLE IF NOT EXISTS "grida_forms"."response_field" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "grida_forms"."form_field_type" DEFAULT 'text'::"grida_forms"."form_field_type" NOT NULL,
    "value" "json",
    "response_id" "uuid" NOT NULL,
    "form_field_id" "uuid" NOT NULL,
    "form_id" "uuid",
    "form_field_option_id" "uuid",
    "storage_object_paths" "text"[],
    "form_field_option_ids" "uuid"[]
);


ALTER TABLE "grida_forms"."response_field" OWNER TO "postgres";


COMMENT ON COLUMN "grida_forms"."response_field"."value" IS 'response value for a form field';



COMMENT ON COLUMN "grida_forms"."response_field"."storage_object_paths" IS 'user uploaded file object path';



COMMENT ON COLUMN "grida_forms"."response_field"."form_field_option_ids" IS 'used (only) when multiple if supported for the field';



CREATE TABLE IF NOT EXISTS "grida_forms"."response_session" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "x_ipinfo" "jsonb",
    "x_useragent" "text",
    "x_referer" "text",
    "ip" "text",
    "geo" "jsonb",
    "platform_powered_by" "grida_forms"."response_platform_powered_by",
    "browser" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visitor_id" "uuid",
    "raw" "jsonb"
);


ALTER TABLE "grida_forms"."response_session" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "grida_forms"."schema_document" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "project_id" bigint NOT NULL,
    CONSTRAINT "schema_document_name_check" CHECK (("name" ~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$'::"text"))
);


ALTER TABLE "grida_forms"."schema_document" OWNER TO "postgres";


COMMENT ON TABLE "grida_forms"."schema_document" IS 'database document - collection of tables (relations)';



ALTER TABLE "grida_forms"."relation_view" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_forms"."schema_table_view_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_g11n"."key" (
    "id" bigint NOT NULL,
    "manifest_id" bigint NOT NULL,
    "keypath" "text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "description" "text"
);


ALTER TABLE "grida_g11n"."key" OWNER TO "postgres";


ALTER TABLE "grida_g11n"."key" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_g11n"."key_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_g11n"."locale" (
    "id" bigint NOT NULL,
    "manifest_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "code" "text" NOT NULL
);


ALTER TABLE "grida_g11n"."locale" OWNER TO "postgres";


ALTER TABLE "grida_g11n"."locale" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_g11n"."locale_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_g11n"."manifest" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" bigint NOT NULL,
    "default_locale_id" bigint
);


ALTER TABLE "grida_g11n"."manifest" OWNER TO "postgres";


ALTER TABLE "grida_g11n"."manifest" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_g11n"."manifest_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_g11n"."resource" (
    "id" bigint NOT NULL,
    "manifest_id" bigint NOT NULL,
    "key_id" bigint NOT NULL,
    "locale_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "value" "jsonb" NOT NULL
);


ALTER TABLE "grida_g11n"."resource" OWNER TO "postgres";


ALTER TABLE "grida_g11n"."resource" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_g11n"."value_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_sites"."site_document" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data" "jsonb" NOT NULL,
    "id" "uuid" NOT NULL
);


ALTER TABLE "grida_sites"."site_document" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "grida_x_supabase"."supabase_project" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sb_anon_key" "text" NOT NULL,
    "sb_project_reference_id" "text" NOT NULL,
    "sb_project_url" "text" NOT NULL,
    "sb_public_schema" "jsonb" NOT NULL,
    "sb_service_key_id" "uuid",
    "project_id" bigint NOT NULL,
    "sb_schema_definitions" "jsonb" NOT NULL,
    "sb_schema_names" "text"[] DEFAULT '{public}'::"text"[] NOT NULL,
    "sb_schema_openapi_docs" "jsonb" NOT NULL
);


ALTER TABLE "grida_x_supabase"."supabase_project" OWNER TO "postgres";


COMMENT ON COLUMN "grida_x_supabase"."supabase_project"."sb_public_schema" IS 'LEGACY';



COMMENT ON COLUMN "grida_x_supabase"."supabase_project"."sb_schema_definitions" IS 'public + custom schema definitions';



COMMENT ON COLUMN "grida_x_supabase"."supabase_project"."sb_schema_openapi_docs" IS 'openapi docs by schema names';



ALTER TABLE "grida_x_supabase"."supabase_project" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_x_supabase"."connection_supabase_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "grida_x_supabase"."supabase_table" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "supabase_project_id" bigint NOT NULL,
    "sb_schema_name" "text" NOT NULL,
    "sb_table_name" "text" NOT NULL,
    "sb_table_schema" "jsonb" NOT NULL,
    "sb_postgrest_methods" "grida_x_supabase"."sb_postgrest_method"[] NOT NULL
);


ALTER TABLE "grida_x_supabase"."supabase_table" OWNER TO "postgres";


ALTER TABLE "grida_x_supabase"."supabase_table" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "grida_x_supabase"."connection_supabase_table_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."asset" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "document_id" "uuid" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "object_id" "uuid",
    "is_public" boolean NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "size" bigint NOT NULL
);


ALTER TABLE "public"."asset" OWNER TO "postgres";


COMMENT ON COLUMN "public"."asset"."name" IS 'original file name';



COMMENT ON COLUMN "public"."asset"."type" IS 'mimetype';



CREATE TABLE IF NOT EXISTS "public"."customer" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "uid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "project_id" bigint NOT NULL,
    "_fp_fingerprintjs_visitorid" "text",
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "uuid" "uuid",
    "phone" "text",
    "is_email_verified" boolean DEFAULT false NOT NULL,
    "is_phone_verified" boolean DEFAULT false NOT NULL,
    "visitor_id" "uuid",
    "email_provisional" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "phone_provisional" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "name_provisional" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "public"."customer" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "doctype" "public"."doctype" NOT NULL,
    "project_id" bigint NOT NULL,
    "title" "text" DEFAULT 'Untitled'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "document_title_check" CHECK (("length"("title") < 100))
);


ALTER TABLE "public"."document" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dummy" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "text" "text",
    "user_id" "uuid",
    "data" "jsonb",
    "enum" "grida_commerce"."currency",
    "int2" smallint,
    "int4" integer,
    "float4" real,
    "float8" double precision,
    "numeric" numeric,
    "jsonb" "jsonb",
    "varchar" character varying,
    "richtext" "jsonb",
    "timestamptz" timestamp with time zone,
    "text_arr" "text"[]
);


ALTER TABLE "public"."dummy" OWNER TO "postgres";


ALTER TABLE "public"."dummy" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."dummy_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."organization" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "avatar_path" "text",
    "email" "text",
    "description" "text",
    "blog" "text",
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "organization_name_check" CHECK (("name" ~ '^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$'::"text"))
);


ALTER TABLE "public"."organization" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organization"."email" IS 'contact email';



ALTER TABLE "public"."organization" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."organization_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."organization_member" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" bigint NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL
);


ALTER TABLE "public"."organization_member" OWNER TO "postgres";


ALTER TABLE "public"."organization_member" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."organization_member_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "ref_id" "text",
    CONSTRAINT "project_name_check" CHECK (("name" ~ '^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){1,38}$'::"text"))
);


ALTER TABLE "public"."project" OWNER TO "postgres";


COMMENT ON COLUMN "public"."project"."id" IS 'ID';



ALTER TABLE "public"."project" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."project_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_profile" (
    "uid" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "display_name" "text" NOT NULL,
    "avatar_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_project_access_state" (
    "user_id" "uuid" NOT NULL,
    "project_id" bigint NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_project_access_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitor" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" bigint NOT NULL,
    "fingerprint_visitor_id" "text",
    "user_agent" "text",
    "ip" "inet"
);


ALTER TABLE "public"."visitor" OWNER TO "postgres";


ALTER TABLE ONLY "dummy"."orders" ALTER COLUMN "order_id" SET DEFAULT "nextval"('"dummy"."orders_order_id_seq"'::"regclass");



ALTER TABLE ONLY "dummy"."products" ALTER COLUMN "product_id" SET DEFAULT "nextval"('"dummy"."products_product_id_seq"'::"regclass");



ALTER TABLE ONLY "dummy"."shipments" ALTER COLUMN "shipment_id" SET DEFAULT "nextval"('"dummy"."shipments_shipment_id_seq"'::"regclass");



ALTER TABLE ONLY "dummy"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("order_id", "product_id");



ALTER TABLE ONLY "dummy"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id");



ALTER TABLE ONLY "dummy"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("product_id");



ALTER TABLE ONLY "dummy"."shipments"
    ADD CONSTRAINT "shipments_pkey" PRIMARY KEY ("shipment_id");



ALTER TABLE ONLY "dummy"."t1"
    ADD CONSTRAINT "t1_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "dummy"."t2"
    ADD CONSTRAINT "t2_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_canvas"."canvas_document"
    ADD CONSTRAINT "canvas_document_id_key" UNIQUE ("id");



ALTER TABLE ONLY "grida_commerce"."inventory_item"
    ADD CONSTRAINT "inventory_item_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_commerce"."inventory_level_commit"
    ADD CONSTRAINT "inventory_level_commit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_commerce"."inventory_level"
    ADD CONSTRAINT "inventory_level_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_commerce"."product_option"
    ADD CONSTRAINT "option_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_commerce"."product_option_value"
    ADD CONSTRAINT "option_value_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_commerce"."product_option_value"
    ADD CONSTRAINT "option_value_unique_per_option" UNIQUE ("value", "option_id");



ALTER TABLE ONLY "grida_commerce"."product_option_combination_value_item"
    ADD CONSTRAINT "product_option_map_item_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_commerce"."product_option_combination"
    ADD CONSTRAINT "product_option_map_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_commerce"."product"
    ADD CONSTRAINT "product_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_commerce"."product"
    ADD CONSTRAINT "product_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "grida_commerce"."product_variant"
    ADD CONSTRAINT "product_variant_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_commerce"."product_variant"
    ADD CONSTRAINT "product_variant_product_option_combination_id_key" UNIQUE ("product_option_combination_id");



ALTER TABLE ONLY "grida_commerce"."product_variant"
    ADD CONSTRAINT "product_variant_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "grida_commerce"."inventory_item"
    ADD CONSTRAINT "sku_unique_per_store" UNIQUE ("sku", "store_id");



ALTER TABLE ONLY "grida_commerce"."store"
    ADD CONSTRAINT "store_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_commerce"."product_option_combination_value_item"
    ADD CONSTRAINT "unique_option_map_combination" UNIQUE ("option_combination_id", "option_id", "option_value_id");



ALTER TABLE ONLY "grida_commerce"."product_option"
    ADD CONSTRAINT "unique_option_name_per_product" UNIQUE ("product_id", "name");



ALTER TABLE ONLY "grida_forms"."connection_supabase"
    ADD CONSTRAINT "connection_supabase_project_form_id_key" UNIQUE ("form_id");



ALTER TABLE ONLY "grida_forms"."connection_supabase"
    ADD CONSTRAINT "connection_supabase_project_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."form_block"
    ADD CONSTRAINT "form_block_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."connection_commerce_store"
    ADD CONSTRAINT "form_connection_store_form_id_key" UNIQUE ("form_id");



ALTER TABLE ONLY "grida_forms"."connection_commerce_store"
    ADD CONSTRAINT "form_connection_store_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."form_document"
    ADD CONSTRAINT "form_document_form_id_key" UNIQUE ("form_id");



ALTER TABLE ONLY "grida_forms"."option"
    ADD CONSTRAINT "form_field_option_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."attribute"
    ADD CONSTRAINT "form_field_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."option"
    ADD CONSTRAINT "form_field_value_unique_constraint" UNIQUE ("form_field_id", "value");



ALTER TABLE ONLY "grida_forms"."form_document"
    ADD CONSTRAINT "form_page_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."form"
    ADD CONSTRAINT "form_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."form_template"
    ADD CONSTRAINT "form_template_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."gist"
    ADD CONSTRAINT "gist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."optgroup"
    ADD CONSTRAINT "optgroup_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."gist"
    ADD CONSTRAINT "playground_gist_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "grida_forms"."response_field"
    ADD CONSTRAINT "response_field_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."response"
    ADD CONSTRAINT "response_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."response"
    ADD CONSTRAINT "response_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "grida_forms"."response_session"
    ADD CONSTRAINT "response_session_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."response_session"
    ADD CONSTRAINT "response_session_visitor_id_key" UNIQUE ("visitor_id");



ALTER TABLE ONLY "grida_forms"."schema_document"
    ADD CONSTRAINT "schema_document_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."relation_view"
    ADD CONSTRAINT "schema_table_view_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_forms"."response"
    ADD CONSTRAINT "unique_local_id_per_form" UNIQUE ("form_id", "local_index");



ALTER TABLE ONLY "grida_forms"."attribute"
    ADD CONSTRAINT "unique_name_form_id" UNIQUE ("name", "form_id");



ALTER TABLE ONLY "grida_forms"."schema_document"
    ADD CONSTRAINT "unique_schema_name_in_project" UNIQUE ("name", "project_id");



ALTER TABLE ONLY "grida_forms"."response_field"
    ADD CONSTRAINT "uniqye_response_field_per_response" UNIQUE ("response_id", "form_field_id");



ALTER TABLE ONLY "grida_g11n"."key"
    ADD CONSTRAINT "key_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_g11n"."locale"
    ADD CONSTRAINT "locale_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_g11n"."manifest"
    ADD CONSTRAINT "manifest_default_locale_id_key" UNIQUE ("default_locale_id");



ALTER TABLE ONLY "grida_g11n"."manifest"
    ADD CONSTRAINT "manifest_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_g11n"."key"
    ADD CONSTRAINT "unique_key_by_manifest" UNIQUE ("manifest_id", "keypath");



ALTER TABLE ONLY "grida_g11n"."locale"
    ADD CONSTRAINT "unique_locale_code_by_manifest" UNIQUE ("manifest_id", "code");



ALTER TABLE ONLY "grida_g11n"."resource"
    ADD CONSTRAINT "value_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_sites"."site_document"
    ADD CONSTRAINT "site_document_id_key" UNIQUE ("id");



ALTER TABLE ONLY "grida_x_supabase"."supabase_project"
    ADD CONSTRAINT "connection_supabase_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_x_supabase"."supabase_table"
    ADD CONSTRAINT "connection_supabase_table_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "grida_x_supabase"."supabase_project"
    ADD CONSTRAINT "supabase_project_project_id_key" UNIQUE ("project_id");



ALTER TABLE ONLY "grida_x_supabase"."supabase_table"
    ADD CONSTRAINT "unique_project_supabase_table" UNIQUE ("supabase_project_id", "sb_schema_name", "sb_table_name");



ALTER TABLE ONLY "grida_x_supabase"."supabase_project"
    ADD CONSTRAINT "unique_supabase_project_reference_by_project" UNIQUE ("project_id", "sb_project_reference_id");



ALTER TABLE ONLY "public"."asset"
    ADD CONSTRAINT "asset_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."asset"
    ADD CONSTRAINT "asset_object_id_key" UNIQUE ("object_id");



ALTER TABLE ONLY "public"."asset"
    ADD CONSTRAINT "asset_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_pkey" PRIMARY KEY ("uid");



ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_uid_key" UNIQUE ("uid");



ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_visitor_id_key" UNIQUE ("visitor_id");



ALTER TABLE ONLY "public"."document"
    ADD CONSTRAINT "document_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dummy"
    ADD CONSTRAINT "dummy_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization"
    ADD CONSTRAINT "organization_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."organization_member"
    ADD CONSTRAINT "organization_member_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization"
    ADD CONSTRAINT "organization_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."organization"
    ADD CONSTRAINT "organization_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project"
    ADD CONSTRAINT "project_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project"
    ADD CONSTRAINT "project_ref_id_key" UNIQUE ("ref_id");



ALTER TABLE ONLY "public"."project"
    ADD CONSTRAINT "unique_name_per_org" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."project"
    ADD CONSTRAINT "unique_org_project" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "unique_project_id_fp_visitor_id" UNIQUE ("project_id", "_fp_fingerprintjs_visitorid");



ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "unique_uuid_project_id" UNIQUE ("uuid", "project_id");



ALTER TABLE ONLY "public"."user_profile"
    ADD CONSTRAINT "user_profile_pkey" PRIMARY KEY ("uid");



ALTER TABLE ONLY "public"."user_project_access_state"
    ADD CONSTRAINT "user_project_access_state_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_project_access_state"
    ADD CONSTRAINT "user_project_access_state_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."visitor"
    ADD CONSTRAINT "visitor_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "idx_unique_initialize_by_system" ON "grida_commerce"."inventory_level_commit" USING "btree" ("inventory_level_id") WHERE ("reason" = 'initialize_by_system'::"grida_commerce"."inventory_level_commit_reason");



CREATE UNIQUE INDEX "idx_unique_product_non_null" ON "grida_commerce"."inventory_item" USING "btree" ("product_id") WHERE (("product_id" IS NOT NULL) AND ("variant_id" IS NULL));



CREATE UNIQUE INDEX "idx_unique_product_variant_non_null" ON "grida_commerce"."inventory_item" USING "btree" ("product_id", "variant_id") WHERE (("product_id" IS NOT NULL) AND ("variant_id" IS NOT NULL));



CREATE UNIQUE INDEX "idx_unique_product_when_variant_null" ON "grida_commerce"."inventory_item" USING "btree" ("product_id") WHERE ("variant_id" IS NULL);



CREATE UNIQUE INDEX "idx_unique_variant_non_null" ON "grida_commerce"."inventory_item" USING "btree" ("variant_id") WHERE (("variant_id" IS NOT NULL) AND ("product_id" IS NULL));



CREATE INDEX "idx_customer_created_at" ON "public"."customer" USING "btree" ("created_at");



CREATE INDEX "idx_customer_project_created_at" ON "public"."customer" USING "btree" ("project_id", "created_at");



CREATE INDEX "organization_member_organization_id_idx" ON "public"."organization_member" USING "btree" ("organization_id");



CREATE INDEX "organization_member_user_id_idx" ON "public"."organization_member" USING "btree" ("user_id");



CREATE INDEX "project_organization_id_idx" ON "public"."project" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "unique_lowercase_name" ON "public"."organization" USING "btree" ("lower"("name"));



CREATE OR REPLACE TRIGGER "trg_assign_product_id_and_validate_variant" BEFORE INSERT OR UPDATE ON "grida_commerce"."inventory_item" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."assign_product_id_and_validate_variant"();



CREATE OR REPLACE TRIGGER "trg_check_negative_inventory" BEFORE INSERT OR UPDATE OF "available" ON "grida_commerce"."inventory_item" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."check_negative_inventory"();



COMMENT ON TRIGGER "trg_check_negative_inventory" ON "grida_commerce"."inventory_item" IS 'This trigger enforces the rule preventing negative inventory levels unless explicitly allowed. It provides detailed error messages and handles complex logic that a CHECK constraint alone cannot manage. The logic is duplicated from the CHECK constraint to ensure immediate feedback.';



CREATE OR REPLACE TRIGGER "trg_create_product_variant" AFTER INSERT ON "grida_commerce"."product_option_combination" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."create_product_variant"();



CREATE OR REPLACE TRIGGER "trg_initialize_inventory_item" AFTER INSERT ON "grida_commerce"."product_variant" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."initialize_inventory_item"();



CREATE OR REPLACE TRIGGER "trg_initialize_inventory_level" AFTER INSERT ON "grida_commerce"."inventory_item" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."initialize_inventory_level"();



CREATE OR REPLACE TRIGGER "trg_initialize_inventory_level_commit_by_system" AFTER INSERT ON "grida_commerce"."inventory_level" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."initialize_inventory_level_commit_by_system_on_inventory_level_"();



CREATE OR REPLACE TRIGGER "trg_update_inventory_item_available" AFTER INSERT OR UPDATE ON "grida_commerce"."inventory_level" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."update_inventory_item_available"();



CREATE OR REPLACE TRIGGER "trg_update_inventory_item_sku" AFTER UPDATE OF "sku" ON "grida_commerce"."product_variant" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."update_inventory_item_sku"();



CREATE OR REPLACE TRIGGER "trigger_delete_option_value_delete" AFTER DELETE ON "grida_commerce"."product_option_value" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."populate_option_map_on_new_option_delete"();



CREATE OR REPLACE TRIGGER "trigger_inventory_level_commit_delete" AFTER DELETE ON "grida_commerce"."inventory_level_commit" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."update_inventory_on_delete"();



CREATE OR REPLACE TRIGGER "trigger_inventory_level_commit_insert" AFTER INSERT ON "grida_commerce"."inventory_level_commit" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."update_inventory_on_insert"();



CREATE OR REPLACE TRIGGER "trigger_new_option_value_insert" AFTER INSERT ON "grida_commerce"."product_option_value" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."populate_option_map_on_new_option_insert"();



CREATE OR REPLACE TRIGGER "trigger_prevent_diff_update" BEFORE UPDATE ON "grida_commerce"."inventory_level_commit" FOR EACH ROW EXECUTE FUNCTION "grida_commerce"."prevent_inventory_level_commit_diff_update"();



CREATE OR REPLACE TRIGGER "check_general_access_before_insert" BEFORE INSERT ON "grida_forms"."response" FOR EACH ROW EXECUTE FUNCTION "grida_forms"."check_general_access"();



CREATE OR REPLACE TRIGGER "check_max_responses_before_insert" BEFORE INSERT ON "grida_forms"."response" FOR EACH ROW EXECUTE FUNCTION "grida_forms"."trg_check_max_responses"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "grida_forms"."attribute" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "grida_forms"."form_block" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "grida_forms"."response_field" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "grida_forms"."response_session" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "ping_form_update_after_form_field_update" AFTER UPDATE ON "grida_forms"."attribute" FOR EACH ROW EXECUTE FUNCTION "grida_forms"."ping_form_update"();



CREATE OR REPLACE TRIGGER "trg_auto_increment_local_index" BEFORE INSERT ON "grida_forms"."attribute" FOR EACH ROW EXECUTE FUNCTION "grida_forms"."auto_increment_attribute_local_index"();



CREATE OR REPLACE TRIGGER "trg_update_response_updated_at_on_change" AFTER INSERT OR DELETE OR UPDATE ON "grida_forms"."response_field" FOR EACH ROW EXECUTE FUNCTION "grida_forms"."update_response_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_add_playground_gist_slug" BEFORE INSERT ON "grida_forms"."gist" FOR EACH ROW EXECUTE FUNCTION "grida_forms"."add_playground_gist_slug"();



CREATE OR REPLACE TRIGGER "trigger_before_insert_response" BEFORE INSERT OR UPDATE ON "grida_forms"."response" FOR EACH ROW EXECUTE FUNCTION "grida_forms"."update_form_response_local_id"();



CREATE OR REPLACE TRIGGER "trigger_delete_document" AFTER DELETE ON "grida_forms"."form_document" FOR EACH ROW EXECUTE FUNCTION "public"."delete_document_on_form_document_delete"();



CREATE OR REPLACE TRIGGER "delete_vault_record_trigger" AFTER DELETE ON "grida_x_supabase"."supabase_project" FOR EACH ROW EXECUTE FUNCTION "grida_x_supabase"."delete_vault_secret_on_supabase_project_delete"();



CREATE OR REPLACE TRIGGER "supabase_project_moddatetime" BEFORE UPDATE ON "grida_x_supabase"."supabase_project" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "supabase_table_moddatetime" BEFORE UPDATE ON "grida_x_supabase"."supabase_table" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "trigger_add_initial_organization_member" AFTER INSERT ON "public"."organization" FOR EACH ROW EXECUTE FUNCTION "public"."add_initial_organization_member"();



CREATE OR REPLACE TRIGGER "trigger_set_initial_display_name" BEFORE INSERT ON "public"."organization" FOR EACH ROW EXECUTE FUNCTION "public"."set_organization_initial_display_name"();



CREATE OR REPLACE TRIGGER "trigger_set_ref_id" BEFORE INSERT ON "public"."project" FOR EACH ROW EXECUTE FUNCTION "public"."set_project_ref_id"();



ALTER TABLE ONLY "dummy"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "dummy"."orders"("order_id");



ALTER TABLE ONLY "dummy"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "dummy"."products"("product_id");



ALTER TABLE ONLY "dummy"."shipments"
    ADD CONSTRAINT "shipments_order_id_product_id_fkey" FOREIGN KEY ("order_id", "product_id") REFERENCES "dummy"."order_items"("order_id", "product_id");



ALTER TABLE ONLY "dummy"."t2"
    ADD CONSTRAINT "t2_t1_fkey" FOREIGN KEY ("t1") REFERENCES "dummy"."t1"("id");



ALTER TABLE ONLY "grida_canvas"."canvas_document"
    ADD CONSTRAINT "canvas_document_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."document"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."inventory_item"
    ADD CONSTRAINT "inventory_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "grida_commerce"."product"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."inventory_item"
    ADD CONSTRAINT "inventory_item_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "grida_commerce"."store"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."inventory_item"
    ADD CONSTRAINT "inventory_item_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "grida_commerce"."product_variant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."inventory_level_commit"
    ADD CONSTRAINT "inventory_level_commit_inventory_level_id_fkey" FOREIGN KEY ("inventory_level_id") REFERENCES "grida_commerce"."inventory_level"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."inventory_level"
    ADD CONSTRAINT "inventory_level_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "grida_commerce"."inventory_item"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option"
    ADD CONSTRAINT "option_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "grida_commerce"."product"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option"
    ADD CONSTRAINT "option_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "grida_commerce"."store"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option_value"
    ADD CONSTRAINT "option_value_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "grida_commerce"."product_option"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option_value"
    ADD CONSTRAINT "option_value_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "grida_commerce"."product"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option_value"
    ADD CONSTRAINT "option_value_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "grida_commerce"."store"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option_combination_value_item"
    ADD CONSTRAINT "product_option_map_item_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "grida_commerce"."product_option"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option_combination_value_item"
    ADD CONSTRAINT "product_option_map_item_option_map_id_fkey" FOREIGN KEY ("option_combination_id") REFERENCES "grida_commerce"."product_option_combination"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option_combination_value_item"
    ADD CONSTRAINT "product_option_map_item_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "grida_commerce"."product_option_value"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option_combination_value_item"
    ADD CONSTRAINT "product_option_map_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "grida_commerce"."product"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option_combination_value_item"
    ADD CONSTRAINT "product_option_map_item_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "grida_commerce"."store"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option_combination"
    ADD CONSTRAINT "product_option_map_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "grida_commerce"."product"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_option_combination"
    ADD CONSTRAINT "product_option_map_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "grida_commerce"."store"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product"
    ADD CONSTRAINT "product_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "grida_commerce"."store"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_variant"
    ADD CONSTRAINT "product_variant_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "grida_commerce"."product"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_variant"
    ADD CONSTRAINT "product_variant_product_option_combination_id_fkey" FOREIGN KEY ("product_option_combination_id") REFERENCES "grida_commerce"."product_option_combination"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."product_variant"
    ADD CONSTRAINT "product_variant_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "grida_commerce"."store"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_commerce"."store"
    ADD CONSTRAINT "store_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."connection_commerce_store"
    ADD CONSTRAINT "connection_commerce_store_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "grida_commerce"."store"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."connection_supabase"
    ADD CONSTRAINT "connection_supabase_project_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."connection_supabase"
    ADD CONSTRAINT "connection_supabase_project_main_supabase_table_id_fkey" FOREIGN KEY ("main_supabase_table_id") REFERENCES "grida_x_supabase"."supabase_table"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "grida_forms"."connection_supabase"
    ADD CONSTRAINT "connection_supabase_supabase_project_id_fkey" FOREIGN KEY ("supabase_project_id") REFERENCES "grida_x_supabase"."supabase_project"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "grida_forms"."form_block"
    ADD CONSTRAINT "form_block_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."connection_commerce_store"
    ADD CONSTRAINT "form_connection_store_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."connection_commerce_store"
    ADD CONSTRAINT "form_connection_store_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."form_document"
    ADD CONSTRAINT "form_document_g11n_manifest_id_fkey" FOREIGN KEY ("g11n_manifest_id") REFERENCES "grida_g11n"."manifest"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "grida_forms"."form_document"
    ADD CONSTRAINT "form_document_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."document"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."form_document"
    ADD CONSTRAINT "form_document_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."option"
    ADD CONSTRAINT "form_field_option_optgroup_id_fkey" FOREIGN KEY ("optgroup_id") REFERENCES "grida_forms"."optgroup"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "grida_forms"."form"
    ADD CONSTRAINT "form_schema_id_fkey" FOREIGN KEY ("schema_id") REFERENCES "grida_forms"."schema_document"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."form_template"
    ADD CONSTRAINT "form_template_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."form_block"
    ADD CONSTRAINT "grida_forms_form_block_form_field_id_fkey" FOREIGN KEY ("form_field_id") REFERENCES "grida_forms"."attribute"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "grida_forms"."form_block"
    ADD CONSTRAINT "grida_forms_form_block_form_page_id_fkey" FOREIGN KEY ("form_page_id") REFERENCES "grida_forms"."form_document"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."form_block"
    ADD CONSTRAINT "grida_forms_form_block_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "grida_forms"."form_block"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "grida_forms"."form"
    ADD CONSTRAINT "grida_forms_form_default_form_page_id_fkey" FOREIGN KEY ("default_form_page_id") REFERENCES "grida_forms"."form_document"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "grida_forms"."attribute"
    ADD CONSTRAINT "grida_forms_form_field_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."option"
    ADD CONSTRAINT "grida_forms_form_field_option_form_field_id_fkey" FOREIGN KEY ("form_field_id") REFERENCES "grida_forms"."attribute"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."option"
    ADD CONSTRAINT "grida_forms_form_field_option_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."form_document"
    ADD CONSTRAINT "grida_forms_form_page_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."form"
    ADD CONSTRAINT "grida_forms_form_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."response"
    ADD CONSTRAINT "grida_forms_response_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("uid") ON DELETE SET NULL;



ALTER TABLE ONLY "grida_forms"."response_field"
    ADD CONSTRAINT "grida_forms_response_field_form_field_id_fkey" FOREIGN KEY ("form_field_id") REFERENCES "grida_forms"."attribute"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."response_field"
    ADD CONSTRAINT "grida_forms_response_field_form_field_option_id_fkey" FOREIGN KEY ("form_field_option_id") REFERENCES "grida_forms"."option"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "grida_forms"."response_field"
    ADD CONSTRAINT "grida_forms_response_field_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."response_field"
    ADD CONSTRAINT "grida_forms_response_field_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "grida_forms"."response"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."response"
    ADD CONSTRAINT "grida_forms_response_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."optgroup"
    ADD CONSTRAINT "optgroup_form_field_id_fkey" FOREIGN KEY ("form_field_id") REFERENCES "grida_forms"."attribute"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."optgroup"
    ADD CONSTRAINT "optgroup_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."gist"
    ADD CONSTRAINT "playground_gist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."response_session"
    ADD CONSTRAINT "response_session_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("uid") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."response_session"
    ADD CONSTRAINT "response_session_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."response"
    ADD CONSTRAINT "response_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "grida_forms"."response_session"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "grida_forms"."response_session"
    ADD CONSTRAINT "response_session_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitor"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "grida_forms"."schema_document"
    ADD CONSTRAINT "schema_document_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."document"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."schema_document"
    ADD CONSTRAINT "schema_document_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_forms"."relation_view"
    ADD CONSTRAINT "schema_table_view_schema_table_id_fkey" FOREIGN KEY ("relation_id") REFERENCES "grida_forms"."form"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_g11n"."key"
    ADD CONSTRAINT "key_manifest_id_fkey" FOREIGN KEY ("manifest_id") REFERENCES "grida_g11n"."manifest"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_g11n"."locale"
    ADD CONSTRAINT "locale_manifest_id_fkey" FOREIGN KEY ("manifest_id") REFERENCES "grida_g11n"."manifest"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_g11n"."manifest"
    ADD CONSTRAINT "manifest_default_locale_id_fkey" FOREIGN KEY ("default_locale_id") REFERENCES "grida_g11n"."locale"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "grida_g11n"."manifest"
    ADD CONSTRAINT "manifest_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_g11n"."resource"
    ADD CONSTRAINT "value_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "grida_g11n"."key"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_g11n"."resource"
    ADD CONSTRAINT "value_locale_id_fkey" FOREIGN KEY ("locale_id") REFERENCES "grida_g11n"."locale"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_g11n"."resource"
    ADD CONSTRAINT "value_manifest_id_fkey" FOREIGN KEY ("manifest_id") REFERENCES "grida_g11n"."manifest"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_sites"."site_document"
    ADD CONSTRAINT "site_document_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."document"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_x_supabase"."supabase_project"
    ADD CONSTRAINT "connection_supabase_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "grida_x_supabase"."supabase_project"
    ADD CONSTRAINT "supabase_project_sb_service_key_id_fkey" FOREIGN KEY ("sb_service_key_id") REFERENCES "vault"."secrets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "grida_x_supabase"."supabase_table"
    ADD CONSTRAINT "supabase_table_supabase_project_id_fkey" FOREIGN KEY ("supabase_project_id") REFERENCES "grida_x_supabase"."supabase_project"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset"
    ADD CONSTRAINT "asset_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset"
    ADD CONSTRAINT "asset_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "storage"."objects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitor"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document"
    ADD CONSTRAINT "document_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dummy"
    ADD CONSTRAINT "dummy_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "public_customer_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_member"
    ADD CONSTRAINT "public_organization_member_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_member"
    ADD CONSTRAINT "public_organization_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization"
    ADD CONSTRAINT "public_organization_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project"
    ADD CONSTRAINT "public_project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profile"
    ADD CONSTRAINT "user_profile_uid_fkey" FOREIGN KEY ("uid") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_project_access_state"
    ADD CONSTRAINT "user_project_access_state_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_project_access_state"
    ADD CONSTRAINT "user_project_access_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitor"
    ADD CONSTRAINT "visitor_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;



ALTER TABLE "dummy"."t1" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "dummy"."t2" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "based on document access" ON "grida_canvas"."canvas_document" USING ("public"."rls_document"("id")) WITH CHECK ("public"."rls_document"("id"));



ALTER TABLE "grida_canvas"."canvas_document" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Enable read access for all users" ON "grida_commerce"."inventory_level_commit" FOR SELECT USING (true);



CREATE POLICY "REMOVEME: allow read for all" ON "grida_commerce"."inventory_item" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "REMOVEME: allow read for all" ON "grida_commerce"."inventory_level" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "grida_commerce"."inventory_item" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_commerce"."inventory_level" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_commerce"."inventory_level_commit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_commerce"."product" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_commerce"."product_option" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_commerce"."product_option_combination" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_commerce"."product_option_combination_value_item" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_commerce"."product_option_value" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_commerce"."product_variant" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_commerce"."store" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Allow insert (public)" ON "grida_forms"."response_session" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow read for all if public" ON "grida_forms"."form_template" FOR SELECT USING (("is_public" = true));



CREATE POLICY "Enable access for all users" ON "grida_forms"."attribute" USING (true);



CREATE POLICY "Enable delete" ON "grida_forms"."response" FOR DELETE USING (true);



CREATE POLICY "Enable insert access for all users" ON "grida_forms"."gist" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable read access for all users and by user_id if non public" ON "grida_forms"."gist" FOR SELECT USING (("is_public" OR ((NOT "is_public") AND ("user_id" = "auth"."uid"()))));



CREATE POLICY "Enable update for all" ON "grida_forms"."attribute" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "FIXME: Enable all access for all users" ON "grida_forms"."option" USING (true);



CREATE POLICY "FIXME: enable all" ON "grida_forms"."optgroup" USING (true);



CREATE POLICY "REMOVEME - Allow All" ON "grida_forms"."form_block" USING (true);



CREATE POLICY "REMOVEME - Enable read access for all users" ON "grida_forms"."response" FOR SELECT USING (true);



CREATE POLICY "REMOVEME - Enable read access for all users" ON "grida_forms"."response_field" FOR SELECT USING (true);



CREATE POLICY "REMOVEME: Enable all access for all users" ON "grida_forms"."form_document" USING (true);



CREATE POLICY "REMOVEME: Enable read access for all users" ON "grida_forms"."response_session" FOR SELECT USING (true);



CREATE POLICY "REMOVEME: Enable update for all" ON "grida_forms"."response_field" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "REMOVEME: allow all" ON "grida_forms"."connection_commerce_store" USING (true);



CREATE POLICY "REMOVEME: allow all" ON "grida_forms"."connection_supabase" USING (true);



CREATE POLICY "REMOVEME: allow all for all users" ON "grida_forms"."schema_document" USING (true);



CREATE POLICY "access_forms_based_on_project_membership" ON "grida_forms"."form" USING (("project_id" IN ( SELECT "get_projects_for_user"."get_projects_for_user"
   FROM "public"."get_projects_for_user"("auth"."uid"()) "get_projects_for_user"("get_projects_for_user"))));



ALTER TABLE "grida_forms"."attribute" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."connection_commerce_store" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."connection_supabase" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."form" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."form_block" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."form_document" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."form_template" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."gist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."optgroup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."option" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."relation_view" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."response" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."response_field" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."response_session" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_forms"."schema_document" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Allow all based on manifest access" ON "grida_g11n"."key" USING ("public"."rls_manifest"("manifest_id"));



CREATE POLICY "Allow all based on manifest access" ON "grida_g11n"."locale" USING ("public"."rls_manifest"("manifest_id"));



CREATE POLICY "Allow all based on manifest access" ON "grida_g11n"."resource" USING ("public"."rls_manifest"("manifest_id"));



CREATE POLICY "Allow based on project membership" ON "grida_g11n"."manifest" USING ("public"."rls_project"("project_id"));



ALTER TABLE "grida_g11n"."key" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_g11n"."locale" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_g11n"."manifest" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_g11n"."resource" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_sites"."site_document" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "based on connection_supabase access" ON "grida_x_supabase"."supabase_table" USING ((EXISTS ( SELECT 1
   FROM "grida_x_supabase"."supabase_project"
  WHERE (("supabase_table"."supabase_project_id" = "supabase_project"."id") AND ("supabase_project"."project_id" IN ( SELECT "supabase_project"."project_id"
           FROM "public"."get_projects_for_user"("auth"."uid"()) "get_projects_for_user"("get_projects_for_user")))))));



CREATE POLICY "project_membership" ON "grida_x_supabase"."supabase_project" USING ("public"."rls_project"("project_id"));



ALTER TABLE "grida_x_supabase"."supabase_project" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "grida_x_supabase"."supabase_table" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Allow all based on user_id" ON "public"."user_project_access_state" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Allow insert based on membership" ON "public"."project" FOR INSERT WITH CHECK ("public"."rls_organization"("organization_id"));



CREATE POLICY "Enable delete for users based on owner_id" ON "public"."organization" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "Enable insert for users based on uid" ON "public"."user_profile" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "uid"));



CREATE POLICY "Enable read access based on membership" ON "public"."customer" FOR SELECT USING ("public"."rls_project"("project_id"));



CREATE POLICY "Enable read access for all users" ON "public"."user_profile" FOR SELECT USING (true);



CREATE POLICY "Enable slect for users based on user_id" ON "public"."organization_member" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Enable update for users based on email" ON "public"."user_profile" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "uid")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "uid"));



CREATE POLICY "Enabled based on membership" ON "public"."organization" FOR SELECT USING ("public"."rls_organization"("id"));



CREATE POLICY "Enabled by membership" ON "public"."organization" FOR UPDATE USING ("public"."rls_organization"("id"));



CREATE POLICY "access_based_on_project_membership" ON "public"."document" USING ("public"."rls_document"("id"));



ALTER TABLE "public"."asset" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dummy" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_member" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rls_asset_delete_policy" ON "public"."asset" FOR DELETE USING ("public"."rls_asset"("id"));



CREATE POLICY "rls_asset_insert_policy" ON "public"."asset" FOR INSERT WITH CHECK ("public"."rls_document"("document_id"));



CREATE POLICY "rls_asset_read_policy" ON "public"."asset" FOR SELECT USING ((("is_public" = true) OR "public"."rls_asset"("id")));



CREATE POLICY "rls_asset_update_policy" ON "public"."asset" FOR UPDATE USING ("public"."rls_asset"("id"));



CREATE POLICY "select_project" ON "public"."project" FOR SELECT USING ("public"."rls_project"("id"));



ALTER TABLE "public"."user_profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_project_access_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visitor" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


CREATE PUBLICATION "supabase_realtime_messages_publication" WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION "supabase_realtime_messages_publication" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "grida_forms"."response";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "grida_forms"."response_session";



GRANT USAGE ON SCHEMA "grida_canvas" TO "anon";
GRANT USAGE ON SCHEMA "grida_canvas" TO "authenticated";
GRANT USAGE ON SCHEMA "grida_canvas" TO "service_role";



GRANT USAGE ON SCHEMA "grida_commerce" TO "anon";
GRANT USAGE ON SCHEMA "grida_commerce" TO "authenticated";
GRANT USAGE ON SCHEMA "grida_commerce" TO "service_role";



GRANT USAGE ON SCHEMA "grida_forms" TO "anon";
GRANT USAGE ON SCHEMA "grida_forms" TO "authenticated";
GRANT USAGE ON SCHEMA "grida_forms" TO "service_role";



GRANT USAGE ON SCHEMA "grida_forms_secure" TO "service_role";



GRANT USAGE ON SCHEMA "grida_sites" TO "anon";
GRANT USAGE ON SCHEMA "grida_sites" TO "authenticated";
GRANT USAGE ON SCHEMA "grida_sites" TO "service_role";



GRANT USAGE ON SCHEMA "grida_x_supabase" TO "anon";
GRANT USAGE ON SCHEMA "grida_x_supabase" TO "authenticated";
GRANT USAGE ON SCHEMA "grida_x_supabase" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "postgres";



GRANT USAGE ON SCHEMA "secure" TO "service_role";











































































































































































































































































































































































GRANT ALL ON FUNCTION "grida_commerce"."assign_product_id_and_validate_variant"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."assign_product_id_and_validate_variant"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."assign_product_id_and_validate_variant"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."check_negative_inventory"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."check_negative_inventory"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."check_negative_inventory"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."create_product_variant"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."create_product_variant"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."create_product_variant"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."generate_combinations"("options" "jsonb", "index" integer, "current" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."generate_combinations"("options" "jsonb", "index" integer, "current" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."generate_combinations"("options" "jsonb", "index" integer, "current" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."get_inventory_items_with_committed"("p_store_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."get_inventory_items_with_committed"("p_store_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."get_inventory_items_with_committed"("p_store_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."get_inventory_with_committed"("p_store_id" bigint, "p_sku" "text") TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."get_inventory_with_committed"("p_store_id" bigint, "p_sku" "text") TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."get_inventory_with_committed"("p_store_id" bigint, "p_sku" "text") TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."initialize_inventory_item"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."initialize_inventory_item"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."initialize_inventory_item"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."initialize_inventory_level"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."initialize_inventory_level"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."initialize_inventory_level"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."initialize_inventory_level_commit_by_system_on_inventory_level_"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."initialize_inventory_level_commit_by_system_on_inventory_level_"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."initialize_inventory_level_commit_by_system_on_inventory_level_"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."populate_option_map_on_new_option_delete"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."populate_option_map_on_new_option_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."populate_option_map_on_new_option_delete"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."populate_option_map_on_new_option_insert"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."populate_option_map_on_new_option_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."populate_option_map_on_new_option_insert"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."prevent_inventory_level_commit_diff_update"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."prevent_inventory_level_commit_diff_update"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."prevent_inventory_level_commit_diff_update"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_item_available"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_item_available"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_item_available"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_item_sku"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_item_sku"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_item_sku"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_on_delete"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_on_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_on_delete"() TO "service_role";



GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_on_insert"() TO "anon";
GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_on_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_commerce"."update_inventory_on_insert"() TO "service_role";



GRANT ALL ON FUNCTION "grida_forms"."add_playground_gist_slug"() TO "anon";
GRANT ALL ON FUNCTION "grida_forms"."add_playground_gist_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_forms"."add_playground_gist_slug"() TO "service_role";



GRANT ALL ON FUNCTION "grida_forms"."auto_increment_attribute_local_index"() TO "anon";
GRANT ALL ON FUNCTION "grida_forms"."auto_increment_attribute_local_index"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_forms"."auto_increment_attribute_local_index"() TO "service_role";



GRANT ALL ON FUNCTION "grida_forms"."check_general_access"() TO "anon";
GRANT ALL ON FUNCTION "grida_forms"."check_general_access"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_forms"."check_general_access"() TO "service_role";



GRANT ALL ON FUNCTION "grida_forms"."check_max_responses"() TO "anon";
GRANT ALL ON FUNCTION "grida_forms"."check_max_responses"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_forms"."check_max_responses"() TO "service_role";



GRANT ALL ON FUNCTION "grida_forms"."core_check_max_responses"("p_form_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "grida_forms"."core_check_max_responses"("p_form_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "grida_forms"."core_check_max_responses"("p_form_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "grida_forms"."ping_form_update"() TO "anon";
GRANT ALL ON FUNCTION "grida_forms"."ping_form_update"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_forms"."ping_form_update"() TO "service_role";



GRANT ALL ON FUNCTION "grida_forms"."rpc_check_max_responses"("form_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "grida_forms"."rpc_check_max_responses"("form_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "grida_forms"."rpc_check_max_responses"("form_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "grida_forms"."set_response_session_field_value"("session_id" "uuid", "key" "text", "value" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "grida_forms"."set_response_session_field_value"("session_id" "uuid", "key" "text", "value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "grida_forms"."set_response_session_field_value"("session_id" "uuid", "key" "text", "value" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "grida_forms"."trg_check_max_responses"() TO "anon";
GRANT ALL ON FUNCTION "grida_forms"."trg_check_max_responses"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_forms"."trg_check_max_responses"() TO "service_role";



GRANT ALL ON FUNCTION "grida_forms"."update_form_response_local_id"() TO "anon";
GRANT ALL ON FUNCTION "grida_forms"."update_form_response_local_id"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_forms"."update_form_response_local_id"() TO "service_role";



GRANT ALL ON FUNCTION "grida_forms"."update_response_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "grida_forms"."update_response_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_forms"."update_response_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "grida_forms_secure"."create_secret_connection_supabase_service_key"("p_supabase_project_id" bigint, "p_secret" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "grida_forms_secure"."create_secret_connection_supabase_service_key"("p_supabase_project_id" bigint, "p_secret" "text") TO "service_role";



REVOKE ALL ON FUNCTION "grida_forms_secure"."reveal_secret_connection_supabase_service_key"("p_supabase_project_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "grida_forms_secure"."reveal_secret_connection_supabase_service_key"("p_supabase_project_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "grida_x_supabase"."delete_vault_secret_on_supabase_project_delete"() TO "anon";
GRANT ALL ON FUNCTION "grida_x_supabase"."delete_vault_secret_on_supabase_project_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "grida_x_supabase"."delete_vault_secret_on_supabase_project_delete"() TO "service_role";


















GRANT ALL ON FUNCTION "public"."add_initial_organization_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_initial_organization_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_initial_organization_member"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_document_on_form_document_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_document_on_form_document_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_document_on_form_document_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_combinations"("product_id" bigint, "option_value_combinations" bigint[]) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_combinations"("product_id" bigint, "option_value_combinations" bigint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_combinations"("product_id" bigint, "option_value_combinations" bigint[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_combinations"("option_ids" bigint[], "product_id" bigint, "store_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_combinations"("option_ids" bigint[], "product_id" bigint, "store_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_combinations"("option_ids" bigint[], "product_id" bigint, "store_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_organizations_for_user"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_organizations_for_user"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organizations_for_user"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_projects_for_user"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_projects_for_user"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_projects_for_user"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_asset"("p_asset_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rls_asset"("p_asset_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_asset"("p_asset_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_document"("p_document_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rls_document"("p_document_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_document"("p_document_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_manifest"("p_manifest_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."rls_manifest"("p_manifest_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_manifest"("p_manifest_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_organization"("p_organization_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."rls_organization"("p_organization_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_organization"("p_organization_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_project"("project_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."rls_project"("project_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_project"("project_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_organization_initial_display_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_organization_initial_display_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_organization_initial_display_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_project_ref_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_project_ref_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_project_ref_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_asset_object_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_asset_object_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_asset_object_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."workspace_documents"("p_organization_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."workspace_documents"("p_organization_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."workspace_documents"("p_organization_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "secure"."fetch_key_id"("p_key_name" "text") TO "service_role";












GRANT ALL ON TABLE "grida_canvas"."canvas_document" TO "anon";
GRANT ALL ON TABLE "grida_canvas"."canvas_document" TO "authenticated";
GRANT ALL ON TABLE "grida_canvas"."canvas_document" TO "service_role";



GRANT ALL ON TABLE "grida_commerce"."inventory_item" TO "anon";
GRANT ALL ON TABLE "grida_commerce"."inventory_item" TO "authenticated";
GRANT ALL ON TABLE "grida_commerce"."inventory_item" TO "service_role";



GRANT ALL ON SEQUENCE "grida_commerce"."inventory_item_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_commerce"."inventory_item_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_commerce"."inventory_item_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_commerce"."inventory_level" TO "anon";
GRANT ALL ON TABLE "grida_commerce"."inventory_level" TO "authenticated";
GRANT ALL ON TABLE "grida_commerce"."inventory_level" TO "service_role";



GRANT ALL ON TABLE "grida_commerce"."inventory_level_commit" TO "anon";
GRANT ALL ON TABLE "grida_commerce"."inventory_level_commit" TO "authenticated";
GRANT ALL ON TABLE "grida_commerce"."inventory_level_commit" TO "service_role";



GRANT ALL ON SEQUENCE "grida_commerce"."inventory_level_commit_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_commerce"."inventory_level_commit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_commerce"."inventory_level_commit_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "grida_commerce"."inventory_level_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_commerce"."inventory_level_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_commerce"."inventory_level_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_commerce"."product_option" TO "anon";
GRANT ALL ON TABLE "grida_commerce"."product_option" TO "authenticated";
GRANT ALL ON TABLE "grida_commerce"."product_option" TO "service_role";



GRANT ALL ON SEQUENCE "grida_commerce"."option_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_commerce"."option_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_commerce"."option_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_commerce"."product_option_value" TO "anon";
GRANT ALL ON TABLE "grida_commerce"."product_option_value" TO "authenticated";
GRANT ALL ON TABLE "grida_commerce"."product_option_value" TO "service_role";



GRANT ALL ON SEQUENCE "grida_commerce"."option_value_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_commerce"."option_value_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_commerce"."option_value_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_commerce"."product" TO "anon";
GRANT ALL ON TABLE "grida_commerce"."product" TO "authenticated";
GRANT ALL ON TABLE "grida_commerce"."product" TO "service_role";



GRANT ALL ON SEQUENCE "grida_commerce"."product_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_commerce"."product_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_commerce"."product_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_commerce"."product_option_combination" TO "anon";
GRANT ALL ON TABLE "grida_commerce"."product_option_combination" TO "authenticated";
GRANT ALL ON TABLE "grida_commerce"."product_option_combination" TO "service_role";



GRANT ALL ON TABLE "grida_commerce"."product_option_combination_value_item" TO "anon";
GRANT ALL ON TABLE "grida_commerce"."product_option_combination_value_item" TO "authenticated";
GRANT ALL ON TABLE "grida_commerce"."product_option_combination_value_item" TO "service_role";



GRANT ALL ON SEQUENCE "grida_commerce"."product_option_map_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_commerce"."product_option_map_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_commerce"."product_option_map_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "grida_commerce"."product_option_map_item_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_commerce"."product_option_map_item_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_commerce"."product_option_map_item_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_commerce"."product_variant" TO "anon";
GRANT ALL ON TABLE "grida_commerce"."product_variant" TO "authenticated";
GRANT ALL ON TABLE "grida_commerce"."product_variant" TO "service_role";



GRANT ALL ON SEQUENCE "grida_commerce"."product_variant_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_commerce"."product_variant_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_commerce"."product_variant_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_commerce"."store" TO "anon";
GRANT ALL ON TABLE "grida_commerce"."store" TO "authenticated";
GRANT ALL ON TABLE "grida_commerce"."store" TO "service_role";



GRANT ALL ON SEQUENCE "grida_commerce"."store_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_commerce"."store_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_commerce"."store_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."attribute" TO "anon";
GRANT ALL ON TABLE "grida_forms"."attribute" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."attribute" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."connection_commerce_store" TO "anon";
GRANT ALL ON TABLE "grida_forms"."connection_commerce_store" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."connection_commerce_store" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."connection_supabase" TO "anon";
GRANT ALL ON TABLE "grida_forms"."connection_supabase" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."connection_supabase" TO "service_role";



GRANT ALL ON SEQUENCE "grida_forms"."connection_supabase_project_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_forms"."connection_supabase_project_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_forms"."connection_supabase_project_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."form" TO "anon";
GRANT ALL ON TABLE "grida_forms"."form" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."form" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."form_block" TO "anon";
GRANT ALL ON TABLE "grida_forms"."form_block" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."form_block" TO "service_role";



GRANT ALL ON SEQUENCE "grida_forms"."form_connection_store_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_forms"."form_connection_store_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_forms"."form_connection_store_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."form_document" TO "anon";
GRANT ALL ON TABLE "grida_forms"."form_document" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."form_document" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."form_template" TO "anon";
GRANT ALL ON TABLE "grida_forms"."form_template" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."form_template" TO "service_role";



GRANT ALL ON SEQUENCE "grida_forms"."form_template_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_forms"."form_template_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_forms"."form_template_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."gist" TO "anon";
GRANT ALL ON TABLE "grida_forms"."gist" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."gist" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."optgroup" TO "anon";
GRANT ALL ON TABLE "grida_forms"."optgroup" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."optgroup" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."option" TO "anon";
GRANT ALL ON TABLE "grida_forms"."option" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."option" TO "service_role";



GRANT ALL ON SEQUENCE "grida_forms"."playground_gist_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_forms"."playground_gist_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_forms"."playground_gist_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."relation_view" TO "anon";
GRANT ALL ON TABLE "grida_forms"."relation_view" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."relation_view" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."response" TO "anon";
GRANT ALL ON TABLE "grida_forms"."response" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."response" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."response_field" TO "anon";
GRANT ALL ON TABLE "grida_forms"."response_field" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."response_field" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."response_session" TO "anon";
GRANT ALL ON TABLE "grida_forms"."response_session" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."response_session" TO "service_role";



GRANT ALL ON TABLE "grida_forms"."schema_document" TO "anon";
GRANT ALL ON TABLE "grida_forms"."schema_document" TO "authenticated";
GRANT ALL ON TABLE "grida_forms"."schema_document" TO "service_role";



GRANT ALL ON SEQUENCE "grida_forms"."schema_table_view_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_forms"."schema_table_view_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_forms"."schema_table_view_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_sites"."site_document" TO "anon";
GRANT ALL ON TABLE "grida_sites"."site_document" TO "authenticated";
GRANT ALL ON TABLE "grida_sites"."site_document" TO "service_role";



GRANT ALL ON TABLE "grida_x_supabase"."supabase_project" TO "anon";
GRANT ALL ON TABLE "grida_x_supabase"."supabase_project" TO "authenticated";
GRANT ALL ON TABLE "grida_x_supabase"."supabase_project" TO "service_role";



GRANT ALL ON SEQUENCE "grida_x_supabase"."connection_supabase_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_x_supabase"."connection_supabase_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_x_supabase"."connection_supabase_id_seq" TO "service_role";



GRANT ALL ON TABLE "grida_x_supabase"."supabase_table" TO "anon";
GRANT ALL ON TABLE "grida_x_supabase"."supabase_table" TO "authenticated";
GRANT ALL ON TABLE "grida_x_supabase"."supabase_table" TO "service_role";



GRANT ALL ON SEQUENCE "grida_x_supabase"."connection_supabase_table_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "grida_x_supabase"."connection_supabase_table_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "grida_x_supabase"."connection_supabase_table_id_seq" TO "service_role";












GRANT ALL ON TABLE "public"."asset" TO "anon";
GRANT ALL ON TABLE "public"."asset" TO "authenticated";
GRANT ALL ON TABLE "public"."asset" TO "service_role";



GRANT ALL ON TABLE "public"."customer" TO "anon";
GRANT ALL ON TABLE "public"."customer" TO "authenticated";
GRANT ALL ON TABLE "public"."customer" TO "service_role";



GRANT ALL ON TABLE "public"."document" TO "anon";
GRANT ALL ON TABLE "public"."document" TO "authenticated";
GRANT ALL ON TABLE "public"."document" TO "service_role";



GRANT ALL ON TABLE "public"."dummy" TO "anon";
GRANT ALL ON TABLE "public"."dummy" TO "authenticated";
GRANT ALL ON TABLE "public"."dummy" TO "service_role";



GRANT ALL ON SEQUENCE "public"."dummy_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."dummy_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."dummy_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."organization" TO "anon";
GRANT ALL ON TABLE "public"."organization" TO "authenticated";
GRANT ALL ON TABLE "public"."organization" TO "service_role";



GRANT ALL ON SEQUENCE "public"."organization_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."organization_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."organization_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."organization_member" TO "anon";
GRANT ALL ON TABLE "public"."organization_member" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_member" TO "service_role";



GRANT ALL ON SEQUENCE "public"."organization_member_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."organization_member_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."organization_member_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."project" TO "anon";
GRANT ALL ON TABLE "public"."project" TO "authenticated";
GRANT ALL ON TABLE "public"."project" TO "service_role";



GRANT ALL ON SEQUENCE "public"."project_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."project_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."project_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_profile" TO "anon";
GRANT ALL ON TABLE "public"."user_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profile" TO "service_role";



GRANT ALL ON TABLE "public"."user_project_access_state" TO "anon";
GRANT ALL ON TABLE "public"."user_project_access_state" TO "authenticated";
GRANT ALL ON TABLE "public"."user_project_access_state" TO "service_role";



GRANT ALL ON TABLE "public"."visitor" TO "anon";
GRANT ALL ON TABLE "public"."visitor" TO "authenticated";
GRANT ALL ON TABLE "public"."visitor" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_canvas" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_canvas" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_canvas" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_canvas" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_canvas" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_canvas" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_canvas" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_canvas" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_canvas" GRANT ALL ON TABLES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_commerce" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_commerce" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_commerce" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_commerce" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_commerce" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_commerce" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_commerce" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_commerce" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_commerce" GRANT ALL ON TABLES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms" GRANT ALL ON TABLES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms_secure" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms_secure" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_forms_secure" GRANT ALL ON TABLES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_sites" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_sites" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_sites" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_sites" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_sites" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_sites" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_sites" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_sites" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_sites" GRANT ALL ON TABLES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_x_supabase" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_x_supabase" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_x_supabase" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_x_supabase" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_x_supabase" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_x_supabase" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_x_supabase" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_x_supabase" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "grida_x_supabase" GRANT ALL ON TABLES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "secure" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "secure" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "secure" GRANT ALL ON TABLES  TO "service_role";



























RESET ALL;
