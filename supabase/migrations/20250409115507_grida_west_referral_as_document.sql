-- 1. add a new doctype for campaign (done on previous migration)
-- 2. [migrate] create new documents with existing campaigns
-- 3. update the id column to reference document id



-- 2. [migrate] create new documents with existing campaigns
INSERT INTO public.document (id, project_id, doctype)
SELECT id, project_id, 'v0_campaign_referral'::public.doctype
FROM grida_west_referral.campaign
ON CONFLICT (id) DO NOTHING;


-- 3. update the id column to reference document id (without touching PK)
ALTER TABLE grida_west_referral.campaign
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id SET NOT NULL,
  ADD FOREIGN KEY (id) REFERENCES public.document(id) ON DELETE CASCADE;