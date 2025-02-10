
-- 
-- update workspace_documents function to include `public` from bucket document
-- 


DROP FUNCTION IF EXISTS workspace_documents(bigint);

CREATE OR REPLACE FUNCTION workspace_documents(p_organization_id bigint)
RETURNS TABLE(
    id uuid,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    doctype public.doctype,
    project_id bigint,
    title text,
    form_id uuid,
    organization_id bigint,
    has_connection_supabase boolean,
    responses bigint,
    max_responses bigint,
    is_public boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.created_at,
        d.updated_at,
        d.doctype,
        d.project_id,
        d.title,
        fd.form_id,
        p.organization_id,
        cs.id IS NOT NULL,
        COALESCE(
            (SELECT COUNT(*) FROM grida_forms.response r WHERE r.form_id = fd.form_id), 
            0
        ),
        f.max_form_responses_in_total,
        bd.public
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
    LEFT JOIN
        grida_storage.bucket_document bd ON d.id = bd.id
    WHERE 
        p.organization_id = p_organization_id;
END;
$$;
