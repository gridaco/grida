# Canonical source bridge

Grida retains Supabase identity, canonical organizations/memberships and product
execution custody. Infra consumes org-only source capabilities. Project identity
is product-local. The default deployment remains source-owned. Candidate consumer behavior is
selected explicitly after the isolated ownership fence; it does not move auth
flows or change the published native DTOs.

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
permanent receipt evidence. These are producer custody, not financial journals. The candidate product adapter
and explicit ownership fence are described below; production cutover remains separate.

Verification, from the Grida root:

```sh
node node_modules/vitest/vitest.mjs run --config editor/vitest.api.config.ts editor/lib/platform/canonical.test.ts
# Use only a dedicated local fixture with the full migration history and seed:
supabase test db supabase/tests/platform_canonical_foundation_test.sql --workdir <dedicated-local-fixture>
```

## Candidate billing owner and product delivery (M3)

The production default remains `GRIDA_BILLING_OWNER=grida` (also the default
when unset). The additive source ownership table starts at `grida`, epoch `1`.
The local M3 candidate uses `GRIDA_BILLING_OWNER=infra` only after the explicit
SQL ownership fence has been activated in its isolated synthetic database.
Missing/mismatched ownership fails closed; a platform failure never selects the
old financial writer as a fallback.

The paid AI seam now supports fresh platform admission, a permanent local claim,
one dispatch transition and a completion receipt/outbox. Synchronous results and
stream finish evidence await local receipt commit. Cancelled/interrupted streams
without reliable final usage retain a dispatched unknown outcome; they never
fabricate zero usage or receive another dispatch grant. A later billing outage
cannot delete or change a committed receipt. Native `cost_mills` remains an exact
decimal string, including up to 18 fractional digits, separate from GG money.
Raw prompts and result bodies are not stored in the receipt; it records the
pricing evidence digest. Unknown provider outcomes require reconciliation.

Source-side environment for the candidate:

- `GRIDA_BILLING_OWNER=infra` and `GRIDA_PLATFORM_BILLING_ORIGIN`: exact platform origin.
- `GRIDA_PLATFORM_USAGE_KEY_ID` / `GRIDA_PLATFORM_USAGE_TOKEN`: sending credential,
  fixed receiving audience `platform.billing.usage`.
- `GRIDA_PLATFORM_ALLOW_LOCAL=1`: permits explicit loopback HTTP in local fixtures.
- `GRIDA_PLATFORM_RECEIPTS_ENVIRONMENT` / `GRIDA_PLATFORM_RECEIPTS_WORKLOAD_KEYS`:
  receiving verifier manifest for the separate `grida.product-receipts` audience.

`POST /internal/platform/products/receipts` accepts only `{limit:1..100}` and
returns `{source_instance,source_epoch,events:[{event_id,producer,execution_id,receipt}]}`.
`POST /internal/platform/products/receipts/ack` accepts only `{event_ids:[UUID]}`.
The consumer commits durable destination custody before ACK, even if financial
application is disabled or delayed. Neither endpoint accepts customer credentials,
producer selectors or arbitrary RPC names. IDs and receipts remain permanently
in source after ACK; no sequence-cursor delivery can skip concurrent commits.

A restricted operator SQL function
`grida_platform.transfer_billing_ownership(expected_epoch bigint, manifest_hash text)`
performs the one-way source fence. It requires the reviewed manifest digest,
waits for active financial SQL transactions, increments the epoch exactly once,
stops source financial onboarding and preserves source financial archives through
canonical organization deletion. All six financial tables reject DML/TRUNCATE
through direct service-role access and old definer RPCs afterward. Product changes
to the former `is_enterprise` commercial flag also fail after transfer. This
function is not executable by `service_role`, authenticated users or anonymous
clients and is not an HTTP administration endpoint.

Legacy Stripe/Metronome SDKs check the source owner at the actual HTTP boundary,
and legacy AI gating verifies source ownership before consulting cached credit.
These checks cannot recall a provider request already in flight. The M5 handoff
must still drain existing writers, revoke/remove their provider credentials,
reconcile the transfer and separately activate the target. M3 local primitives
are not production cutover authorization or a complete migration tool.

The dedicated no-env regression lane is:

```sh
node node_modules/vitest/vitest.mjs run --config editor/vitest.platform.config.ts
```

For the paired local real-SDK proof only, `GRIDA_PLATFORM_AI_FIXTURE_ORIGIN` may
be exactly `http://127.0.0.1:56746`, with `GRIDA_PLATFORM_ALLOW_LOCAL=1`, a
non-production process and `GG_VERCEL_AI_GATEWAY_API_KEY=grida-local-ai-fixture`.
It routes the billed SDK provider to `/v3/ai` on that external simulator. Production,
other URLs/ports, real keys or a concurrent BYOK language provider are rejected.
This fixture is not an arbitrary provider override and never changes BYOK routes.

## Candidate billing consumers (M4)

With `GRIDA_BILLING_OWNER=infra`, published organization billing and upgrade
pages resolve current source membership and redirect to the configured shared
console at `/organizations/{canonical-id}/billing[/upgrade]`. Source sign-in
retains the complete source destination. A return with a validated `purchase_id`
opens that exact organization's `/billing/purchases/{uuid}`. Released returns
that contain only an `intent` cannot identify a purchase: they offer an explicit
billing link without reporting success or guessing a recent payment.

The source uses `GRIDA_PLATFORM_CONSOLE_ORIGIN` for links and
`GRIDA_PLATFORM_BILLING_ORIGIN` for the fixed server API. Both are exact configured
origins, not caller inputs. `GRIDA_PLATFORM_SSR_KEY_ID` / `GRIDA_PLATFORM_SSR_TOKEN`
are a dedicated sending credential for the `platform.grida-ssr` audience.
They are not provider keys and are never included in console URLs. Explicit
nonproduction loopback HTTP also requires `GRIDA_PLATFORM_ALLOW_LOCAL=1`.

Desktop keeps `/desktop/billing/summary` and its existing ready/signed-out/no-org
DTO, including the source `manage_path`. It combines current canonical source
identity with cached platform plan and credit projections. A best-effort,
bounded owner refresh may update an existing credit account; a denied or failed
refresh preserves the cache and its timestamp. Unknown credit remains `null`.
The source performs no financial-view or Stripe/Metronome reads in this branch.

The native `/api/v1/account/credits?organization_id=N` route retains its exact
numeric organization and credit DTO. Original native authority is revalidated
by the issuer and forwarded only to the platform's passive `GET /credits`
projection as `X-Grida-Native-Token`; browser SSR calls instead use
`X-Grida-Account-Token`. Identity, membership and billing failures stay opaque.
There is no privileged source fallback and no provider call on native reads.

Configuration is lazy: identity/listing operations and the independent Forms
API do not require billing credentials. Cached display eligibility is never
paid-execution admission. The default source-owner paths remain available until
an explicit transfer, rather than acting as a fallback after infra failures.

Run the no-env consumer contract lane from the repository root:

```sh
node node_modules/vitest/vitest.mjs run --config editor/vitest.platform-consumers.config.ts
```

These focused tests exercise boundary transports and failures. Actual paired
Supabase/platform HTTP and browser proof is owned by infra's M4 fixture; passing
these unit tests does not claim a live provider or production migration test.

The separate M4 paired fixture selects `GRIDA_PLATFORM_FIXTURE_PROFILE=m4`
and only `http://127.0.0.1:56846` as its AI simulator origin, with the same
synthetic key, local opt-in and nonproduction guards above. The unchanged M3
profile uses port 56746. A profile cannot select the other's port or any host.

`/gateway/manage` is the reverse handoff into canonical Grida management. It
accepts only `intent=organization|settings|create-organization`, typed `return_to`
and, for existing organizations, the matching canonical `org_id`. Current
Supabase membership is required; settings requires the current owner. It reuses
the source member/profile views and existing organization-creation form/writer.
A visible Back to console link retains the exact resource. Signed-out users
resume the complete handoff after source sign-in. The hidden form continuation
is revalidated for same-origin submission and current membership before a write;
creation returns the retained destination, never a guessed newest organization.
Ordinary source forms without that explicit continuation retain their behavior.
The parser and reviewed fixture in this directory mirror infra's versioned
`contracts/platform/destinations.json`; keep that fixture identical on changes.

`/gateway/account` completes the shared console's different-account handoff.
It accepts exactly one opaque 43-character continuation and resolves it through
`POST /platform/v1/continuations/resolve` using the existing SSR workload key,
without user, native or console-session headers. Returned navigation must match
the configured console origin, exact continuation endpoint and typed cancel
destination. An expired or unavailable request cannot select a fallback identity.

The page shows the current verified Grida web identity. Continue returns to the
console's browser-bound OAuth flow; any different identity still requires its
explicit candidate confirmation. Cancel keeps the original console session and
exact destination. Use another account is a progressive Next server-action form
bound to the opaque continuation, with an exact chooser permalink and inline
pending/error feedback. It checks the raw source Origin, Host and same-origin
Fetch Metadata, revalidates the continuation, and signs out only the current
Grida web session with Supabase local scope. It works before hydration. The
server redirects to the configured public Grida sign-in origin with an absolute
chooser continuation, independently of a proxy's internal request URL. It never logs out console or
all other sessions, trusts an identity in the URL, or adds a separate auth issuer.
