-- Add FK-supporting indexes for project deletes.
-- These speed up ON DELETE CASCADE / SET NULL from public.project(id).

create index if not exists document_project_id_idx
  on public.document (project_id);

create index if not exists visitor_project_id_idx
  on public.visitor (project_id);

create index if not exists user_project_access_state_project_id_idx
  on public.user_project_access_state (project_id);

create index if not exists bucket_document_project_id_idx
  on grida_storage.bucket_document (project_id);

create index if not exists campaign_project_id_idx
  on grida_west_referral.campaign (project_id);

create index if not exists referrer_project_id_idx
  on grida_west_referral.referrer (project_id);

create index if not exists grida_forms_form_project_id_idx
  on grida_forms.form (project_id);

create index if not exists form_document_project_id_idx
  on grida_forms.form_document (project_id);

create index if not exists schema_document_project_id_idx
  on grida_forms.schema_document (project_id);

create index if not exists connection_commerce_store_project_id_idx
  on grida_forms.connection_commerce_store (project_id);

create index if not exists store_project_id_idx
  on grida_commerce.store (project_id);

create index if not exists manifest_project_id_idx
  on grida_g11n.manifest (project_id);

create index if not exists customer_auth_policy_project_id_idx
  on grida_ciam.customer_auth_policy (project_id);
