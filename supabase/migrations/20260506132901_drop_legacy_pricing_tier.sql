-- Drop the legacy `display_plan` column and `pricing_tier` enum from
-- `public.organization`. Plan state now lives in `grida_billing.subscription`
-- (Stripe-driven, accessible via `public.v_billing_subscription` /
-- `fn_billing_get_active_subscription`). The Enterprise flag — the only
-- ops-side use of `display_plan` — moves to a dedicated boolean column.
--
-- `display_plan` was never written to by application code or by the Stripe
-- webhook projector; it's been a manual-SQL channel since the legacy
-- 20250316 schema. Dropping it ends the dual-source-of-truth on plan state.

ALTER TABLE public.organization
  ADD COLUMN is_enterprise boolean NOT NULL DEFAULT false;

UPDATE public.organization
   SET is_enterprise = true
 WHERE display_plan = 'v0_enterprise';

ALTER TABLE public.organization DROP COLUMN display_plan;

DROP TYPE public.pricing_tier;
