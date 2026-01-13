-- grida_ciam v4: remove public.customer.user_id and auth.users dependency
-- - Drops customer-facing West Referral RLS that depended on public.rls_via_customer()
-- - Recreates grida_ciam_public.customer_with_tags without user_id
-- - Drops public.rls_via_customer(), the FK constraint, and the user_id column

-- 1) Remove RLS policies that depend on public.rls_via_customer
DROP POLICY IF EXISTS "access_based_on_via_customer" ON grida_west_referral.referrer;
DROP POLICY IF EXISTS "access_based_on_via_customer" ON grida_west_referral.invitation;

-- 2) Drop the helper function
DROP FUNCTION IF EXISTS public.rls_via_customer(uuid);

-- 3) Recreate customer_with_tags view without c.user_id
DROP TRIGGER IF EXISTS insert_customer_with_tags_instead ON grida_ciam_public.customer_with_tags;
DROP VIEW IF EXISTS grida_ciam_public.customer_with_tags;

CREATE VIEW grida_ciam_public.customer_with_tags
WITH (security_invoker = true)
AS
SELECT
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
  c.name,
  c.description,
  c.metadata,
  c.is_marketing_email_subscribed,
  c.is_marketing_sms_subscribed,
  array_remove(array_agg(ct.tag_name), NULL) AS tags,
  c.search_tsv,
  (c.search_text || ' ' || COALESCE(string_agg(ct.tag_name, ' '), '')) AS search_text
FROM public.customer c
LEFT JOIN grida_ciam.customer_tag ct ON c.uid = ct.customer_uid
GROUP BY c.uid;

GRANT ALL ON TABLE grida_ciam_public.customer_with_tags TO anon, authenticated, service_role;

CREATE TRIGGER insert_customer_with_tags_instead
INSTEAD OF INSERT ON grida_ciam_public.customer_with_tags
FOR EACH ROW
EXECUTE FUNCTION grida_ciam.insert_customer_with_tags();

-- 4) Drop FK constraint + column from public.customer
ALTER TABLE public.customer DROP CONSTRAINT IF EXISTS customer_user_id_fkey;
ALTER TABLE public.customer DROP COLUMN IF EXISTS user_id;

