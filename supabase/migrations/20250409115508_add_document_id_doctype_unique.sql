-- Add unique constraint on (id, doctype) to support composite foreign keys
ALTER TABLE public.document
ADD CONSTRAINT document_id_doctype_key UNIQUE (id, doctype);