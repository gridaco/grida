# Canonical source bridge

Grida retains Supabase identity, canonical organizations/memberships and product
execution custody. Infra consumes org-only source capabilities. Project identity
is product-local. This additive foundation does not cut over current billing
writers, billing pages, webhooks, native contracts or auth flows.

The private Node route `/internal/platform/accounts/[...operation]` supports only:

- `POST snapshots`: `{organizations:[{id:"1"}],observation_id:"<22–128 base64url characters>"}`.
  Returns schema version 1, persistent `source_instance` and `source_epoch`, the
  primary database's original `observed_at`, echoed nonce and exactly one
  organization result per requested ID. Unknown IDs are deleted/version `"0"`.
- `POST lifecycle`: `{limit:100}`. Returns `{events:[...]}`. Every event includes
  permanent ID, instance/epoch, organization ID, decimal-string version, kind,
  complete observed state, `observed_at` and `occurred_at`.
- `POST lifecycle/ack`: `{event_ids:["<uuid>"]}`. The consumer must commit its
  durable inbox receipt before ACK. ACK preserves source evidence. Delivery
  returns all unacknowledged events, without a sequence cursor: sequence allocation
  is not commit order, and advancing a cursor could skip a concurrent transaction.

The route requires `Authorization: Bearer <opaque>` and
`X-Grida-Workload-Key-ID`. It does not accept cookies, browser Origin, arbitrary
SQL, user IDs or project authority. It bypasses browser/tenant proxy routing;
that bypass grants no authorization. Source service-role credentials remain in
Grida and are used only after the dedicated workload verification and strict
input validation. Existing unrelated database grants are unchanged.

Receiving configuration:

- `GRIDA_PLATFORM_CANONICAL_ENVIRONMENT`: fixed environment name.
- `GRIDA_PLATFORM_CANONICAL_WORKLOAD_KEYS`: JSON array with exact fields `id`,
  `verifier_sha256` (lowercase SHA-256 hex), `environment`, `audience`,
  `not_before`, `not_after` (timestamps), `revoked` (boolean). Fixed audience is
  `platform.canonical`. Never put sending plaintext tokens in this manifest.

The key contract matches `infra/packages/go/workloadauth`: maximum 90-day
lifetime, at most two nonrevoked keys per environment/audience, at most 24 hours
of overlap, no reused ID or verifier across the complete deployment manifest.
Revocation must reach every receiver and survive restart. Config is read for
each request; source primary failures fail closed and diagnostics are not
returned to callers. No live provider credentials or calls are required for
local verification.

User context and organization listing use real user bearer PostgREST RPCs
`platform_account_context(organization_id text)` and
`platform_organizations_page(after_id text)`. They bind to `auth.uid()` and
current membership/owner. OAuth tokens additionally require their `client_id`
in private `grida_platform.oauth_clients`, populated by controlled setup.
Native and browser auth flows are unchanged. Infra maps the canonical role into
its own capabilities; the source does not grant product permissions.

The additive migration and pgTAP tests live under `supabase/`. Private source
state is RLS protected and has no direct client or service-role table grants.
Per-org versions and tombstones survive organization deletion. A source restore
must be reconciled using a new source epoch before resuming authority; restarting
a process does not change epochs. These RPCs do not automatically certify a
restored source or override a destination tombstone.

Product server adapters may use the service-only `platform_product_execution_*`
RPCs after a fresh complete paid-admission decision. A claim binds producer,
execution, organization, product, operation/model, policy and `cost_mills` unit.
Dispatch commits once before the provider call; replay never grants dispatch
again. A crash after dispatch remains unknown until trustworthy evidence is
reconciled. Completion and the usage outbox commit together, including after
canonical deletion; identical retries are harmless and conflicting evidence is
rejected. `platform_product_usage_page` / `platform_product_usage_ack` preserve
permanent receipt evidence. These are producer custody, not financial journals
or proof that the later product adapters/admission/cutover are implemented.

Verification, from the Grida root:

```sh
node node_modules/vitest/vitest.mjs run --config editor/vitest.api.config.ts editor/lib/platform/canonical.test.ts
# Use only a dedicated local fixture with the full migration history and seed:
supabase test db supabase/tests/platform_canonical_foundation_test.sql --workdir <dedicated-local-fixture>
```
