-- [Doctype] --
---------------------------------------------------------------------
CREATE TYPE public.doctype AS ENUM (
    'v0_form',
    'v0_site',
    'v0_schema',
    'v0_canvas',
    'v0_bucket',
    'v0_campaign_referral'
);



---------------------------------------------------------------------
-- [Document] --
---------------------------------------------------------------------

-- document is a unit of building blocks, with a designated schema and purpose. it...
-- serves as a base for all other document types. (e.g. grida_forms.form_document.id is a document.id)
-- serves as a entry point for saas users to the doctyped editor.
-- serves as a context provider connection for www layout and page. (e.g. tenant/some-route may be connected to a document with doctype of 'form', where it will look up the form document table, provide the required rendering and application logic context)

CREATE TABLE public.document (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  doctype public.doctype not null,
  project_id bigint not null,
  title text not null default 'Untitled'::text,
  updated_at timestamp with time zone not null default now(),
  constraint document_pkey primary key (id),
  constraint document_project_id_fkey foreign KEY (project_id) references project (id) on delete CASCADE,
  constraint document_title_check check ((length(title) < 100)),
  constraint document_id_doctype_key UNIQUE (id, doctype)
) TABLESPACE pg_default;

ALTER TABLE public.document ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_based_on_project_membership" ON public.document USING (public.rls_document(id));
