---
name: ee-billing
description: >
  Work on Grida's Platform billing consumers, credit display, paid AI admission,
  or signed webhook delivery. Use for editor integration and local insiders/BYOK
  development; Platform billing handles financial operations and policy.
---

# Grida billing consumers

Platform billing handles subscriptions, payments, and credit accounts. Grida
owns identity, canonical organizations, product execution receipts, native DTOs,
and editor credit UX. Do not recreate the retired billing SDKs or billing CLI.

Read [the local contributor guide](../../../docs/contributing/billing.md) and
[the integration README](../../../editor/lib/platform/README.md) for the affected
seam. Local Grida development uses Supabase, insiders auth, and optional
contributor text BYOK; vendor billing setup is not required for that path.

For consumer changes:

- Keep Platform configuration lazy. Missing configuration denies the affected
  paid/billing action and preserves unavailable credit display; identity and
  unbilled paths remain usable. Never fall back to source financial tables.
- Preserve published native credit DTOs, exact receipt units, original execution
  identities, and unknown-versus-zero display. A cached balance cannot authorize work.
- Preserve claim before dispatch, one dispatch, receipt/outbox before success,
  and unknown-outcome reconciliation. Keep product receipts through deletion/restore.
- Retained webhook endpoints verify the exact provider signature and preserve
  event custody before acknowledging delivery. They never execute retired source
  projectors. Consult [security](../security/SKILL.md) for the affected boundary.
- Contributor BYOK changes only text/chat funding; authentication still applies.
  Hosted media remains admitted and billed. Use `BYOK_VERCEL_AI_GATEWAY_API_KEY`
  and never deploy an instance-wide contributor override to hosted/preview.

Run the affected focused checks listed in the integration README, then the
repository's required typecheck. Keep proof claims within the checks actually
executed. Editor integration work does not authorize deployments, provider
operations, or credential changes.

Keep public guidance self-contained and link only to publicly accessible
product, documentation, or source-code references. Preserve existing billing
URLs, commercial terms, issue IDs, and manual-case history when correcting guidance.
