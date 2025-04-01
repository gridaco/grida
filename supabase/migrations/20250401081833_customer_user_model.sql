ALTER TABLE public.customer
ADD COLUMN user_id uuid null,
ADD CONSTRAINT customer_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE SET NULL;


-- update the customer_with_tags view
DROP VIEW IF EXISTS public.customer_with_tags;
CREATE OR REPLACE VIEW public.customer_with_tags WITH (security_invoker = true) as
select
  c.created_at,
  c.uid,
  c.user_id,
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
  (c.search_text || ' ' || coalesce(string_agg(ct.tag_name, ' '), '')) AS search_text
from
  customer c
  left join customer_tag ct on c.uid = ct.customer_uid
group by
  c.uid;


-- recreate the trigger as well
CREATE TRIGGER insert_customer_with_tags_instead
INSTEAD OF INSERT ON public.customer_with_tags
FOR EACH ROW
EXECUTE FUNCTION public.insert_customer_with_tags();