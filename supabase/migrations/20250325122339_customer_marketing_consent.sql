ALTER TABLE public.customer
ADD COLUMN is_marketing_email_subscribed boolean NOT NULL DEFAULT false,
ADD COLUMN is_marketing_sms_subscribed boolean NOT NULL DEFAULT false;
