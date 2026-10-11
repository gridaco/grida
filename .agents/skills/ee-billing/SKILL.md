---
name: ee-billing
description: >
  Work on Grida's Platform billing consumers, credit display, paid AI admission,
  or retained signed webhook forwarding. Financial operations and policy belong
  to the paired infra repository; ordinary Grida insiders/BYOK development is independent.
---

# Grida billing consumers

Platform is the sole financial owner. Keep Grida identity, canonical
organizations, product claims/receipts, native DTOs, and editor credit UX beside
their consumers. Do not recreate the retired Stripe/Metronome writer or billing CLI.

Read [the local contributor guide](../../../docs/contributing/billing.md) and
[the source bridge](../../../editor/lib/platform/README.md) for the affected seam.
Ordinary public Grida development uses local Supabase, insiders auth, and optional
contributor text BYOK; it requires no private infra checkout or vendor billing setup.

For consumer changes:

- Keep Platform configuration lazy. Missing financial configuration denies the
  affected paid/billing action and preserves unavailable credit display; identity
  and unbilled paths remain usable. Never fall back to source financial tables.
- Preserve published native credit DTOs, exact receipt units, original execution
  identities, and unknown-versus-zero display. A cached balance cannot authorize work.
- Preserve claim before dispatch, one dispatch, receipt/outbox before success,
  and unknown-outcome reconciliation. Keep producer receipts through deletion/restore.
- Retained webhook URLs verify the exact provider signature, persist raw capture,
  forward to the fixed Platform capture endpoint, and ACK only after durable target
  custody. They never execute retired source projectors. Consult
  [security](../security/SKILL.md) for the affected trust boundary.
- Contributor BYOK changes only text/chat funding; authentication still applies.
  Hosted media remains admitted and billed. Use the current `BYOK_VERCEL_AI_GATEWAY_API_KEY`
  name and never deploy an instance-wide contributor override to hosted/preview.

Run the affected focused checks listed in the source bridge, then the repository's
required typecheck. Paired HTTP/browser billing proof belongs to infra's
`integration/local/billing/README.md`; genuine vendor proof belongs to its separate
Sandbox workflow. Those private paths are maintainer references, not public
contributor prerequisites. Use infra's billing skill for financial policy,
provider operations, schema, or recovery work; permission to edit Grida does not
authorize deployment, vendor writes, or credential retirement.

Keep public billing pages self-contained at their existing URLs. Private infra
links cannot replace public support or contributor instructions. Retain issue IDs
and historical provenance when correcting ownership guidance.
