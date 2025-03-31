ALTER TABLE public.customer
  ADD CONSTRAINT unique_customer_uid_project_id UNIQUE (uid, project_id);