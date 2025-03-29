CREATE EXTENSION IF NOT EXISTS pg_trgm;


CREATE OR REPLACE FUNCTION public.flatten_jsonb_object_values(obj jsonb)
RETURNS text AS $$
  SELECT string_agg(value::text, ' ')
  FROM jsonb_each_text(coalesce(obj, '{}'))
$$ LANGUAGE sql IMMUTABLE;


ALTER TABLE public.customer
ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(email, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(phone, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(description, '')), 'C') ||
  setweight(to_tsvector('simple', coalesce(uuid::text, '')), 'D') ||
  setweight(to_tsvector('simple', coalesce(uid::text, '')), 'D') ||
  setweight(to_tsvector('simple', flatten_jsonb_object_values(metadata)), 'C')
) STORED;

CREATE INDEX customer_search_idx ON public.customer USING GIN (search_tsv);

ALTER TABLE public.customer
ADD COLUMN search_text text GENERATED ALWAYS AS (
  coalesce(name, '') || ' ' ||
  coalesce(email::text, '') || ' ' ||
  coalesce(phone::text, '') || ' ' ||
  coalesce(description, '') || ' ' ||
  coalesce(uuid::text, '') || ' ' ||
  coalesce(uid::text, '') || ' ' ||
  flatten_jsonb_object_values(metadata)
) STORED;

CREATE INDEX customer_search_text_trgm_idx ON customer USING GIN (search_text gin_trgm_ops);

-- update the customer_with_tags view
CREATE OR REPLACE VIEW public.customer_with_tags WITH (security_invoker = true) as
select
  c.created_at,
  c.uid,
  c.email,
  c.project_id,
  c._fp_fingerprintjs_visitorid,
  c.last_seen_at,
  c.uuid,
  c.phone,
  c.is_email_verified,
  c.is_phone_verified,
  c.visitor_id,
  c.email_provisional,
  c.phone_provisional,
  c.name_provisional,
  c.description,
  c.metadata,
  c.name,
  c.is_marketing_email_subscribed,
  c.is_marketing_sms_subscribed,
  array_remove(array_agg(ct.tag_name), null::text) as tags,
  c.search_tsv, -- tsv for search (global search)
  (c.search_text || ' ' || coalesce(string_agg(ct.tag_name, ' '), '')) AS search_text  -- text for filtering
from
  customer c
  left join customer_tag ct on c.uid = ct.customer_uid
group by
  c.uid;