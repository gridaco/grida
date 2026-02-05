-- Add FK-supporting indexes for cascade deletes.
-- These speed up deletes of public.customer/public.document (and in turn public.project).

-- customer(uid) children
create index if not exists customer_otp_challenge_customer_uid_idx
  on grida_ciam.customer_otp_challenge (customer_uid);

create index if not exists customer_portal_session_customer_uid_idx
  on grida_ciam.customer_portal_session (customer_uid);

create index if not exists grida_forms_response_customer_id_idx
  on grida_forms.response (customer_id);

create index if not exists response_session_customer_id_idx
  on grida_forms.response_session (customer_id);

create index if not exists invitation_customer_id_idx
  on grida_west_referral.invitation (customer_id);

create index if not exists referrer_customer_id_idx
  on grida_west_referral.referrer (customer_id);

create index if not exists referrer_customer_id_project_id_idx
  on grida_west_referral.referrer (customer_id, project_id);

-- document(id) children
create index if not exists asset_document_id_idx
  on public.asset (document_id);

create index if not exists user_project_access_state_document_id_idx
  on public.user_project_access_state (document_id);

-- layout(document_id, document_type) composite FK
create index if not exists layout_document_id_document_type_idx
  on grida_www.layout (document_id, document_type);
