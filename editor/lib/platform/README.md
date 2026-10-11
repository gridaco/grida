# Grida source bridge and Platform consumers

Platform in the paired `infra` repository is the sole financial owner. Grida
retains Supabase identity, canonical organizations/memberships, product execution
custody, native API DTOs, and display/console handoff consumers. Product/project
identity remains product-local. No `GRIDA_BILLING_OWNER` selector or retired source
financial writer is available as a fallback.

Configuration is lazy. Ordinary Grida-only local development uses local Supabase,
insiders auth, and optional contributor text BYOK; it needs no private infra
checkout or vendor billing setup. Identity/listing, Forms, and unbilled paths load
without billing configuration. Missing Platform configuration leaves credit
display unavailable and denies the affected billing/paid operation.

## Canonical source authority

The private Node route `/internal/platform/accounts/[...operation]` supports:

- `POST snapshots`: `{organizations:[{id:"1"}],observation_id:"<22–128 base64url characters>"}`.
  Returns schema version 1, persistent `source_instance`/`source_epoch`, original
  primary observation time, echoed nonce, and exactly one result per requested
  organization. Unknown IDs are deleted/version `"0"`.
- `POST lifecycle`: `{limit:100}` returns `{events:[...]}` with permanent ID,
  instance/epoch, organization, decimal-string version, kind, complete state,
  observation time, and occurrence time.
- `POST lifecycle/ack`: `{event_ids:["<uuid>"]}`. Commit durable destination inbox
  custody before ACK. Source evidence remains permanent. Deliver unacknowledged
  events without a sequence cursor: allocation order is not commit order.

These routes require `Authorization: Bearer <opaque>` and
`X-Grida-Workload-Key-ID`. They accept no browser cookie/Origin, arbitrary SQL,
user selector, or project authority. Proxy bypass grants no authorization.
Source service-role credentials stay in Grida behind workload verification and
strict inputs; source primary failures fail closed without caller diagnostics.

Receiving configuration is `GRIDA_PLATFORM_CANONICAL_ENVIRONMENT` and
`GRIDA_PLATFORM_CANONICAL_WORKLOAD_KEYS`: an exact JSON key manifest of `id`,
`verifier_sha256`, `environment`, `audience`, `not_before`, `not_after`, and
`revoked`. The audience is `platform.canonical`; only verifier hashes belong in
this receiving manifest. The shared workload contract has a maximum 90-day
lifetime, two nonrevoked keys per environment/audience, at most 24 hours overlap,
and no reused ID/verifier. Revocation reaches every receiver and survives restart.

User context and organization listing use real user-bearer PostgREST RPCs
`platform_account_context(organization_id text)` and
`platform_organizations_page(after_id text)`, bound to `auth.uid()` and current
membership/ownership. OAuth additionally requires the registered `client_id` in
private `grida_platform.oauth_clients`. Native/browser auth flows remain their
own contracts; Platform maps canonical roles to its own product capabilities.

Canonical RLS state, versions, and deletion tombstones remain source-owned.
Private tables have no direct client/service-role grants. A restore requires a
new source epoch and reviewed reconciliation before fresh authority resumes;
process restart does not change epochs or override destination tombstones.

## Billing displays and console handoffs

Organization billing/upgrade entry pages resolve current Grida membership and
redirect to the fixed console `/organizations/{canonical-id}/billing[/upgrade]`.
Sign-in retains the exact destination. Validated `purchase_id` returns identify
that organization's exact `/billing/purchases/{uuid}`; an old intent-only return
offers a billing link without guessing a purchase or reporting payment success.

`GRIDA_PLATFORM_CONSOLE_ORIGIN` and `GRIDA_PLATFORM_BILLING_ORIGIN` are exact
configured origins, never caller inputs. `GRIDA_PLATFORM_SSR_KEY_ID` /
`GRIDA_PLATFORM_SSR_TOKEN` send to the `platform.grida-ssr` audience. Workload
tokens are server-only and never enter console URLs. Explicit nonproduction
loopback HTTP requires `GRIDA_PLATFORM_ALLOW_LOCAL=1`.

Desktop retains `/desktop/billing/summary`, its ready/signed-out/no-org DTO, and
source `manage_path`. Display combines canonical identity with Platform plan and
cached credit projections. Bounded best-effort refresh preserves the cache and
original observation time on failure. Unknown credit remains `null`; Grida reads
no source financial views or payment-provider APIs.

Native `/api/v1/account/credits?organization_id=N` retains its numeric org and
published credit DTO. The issuer revalidates native authority and forwards it
only to Platform's passive credits projection as `X-Grida-Native-Token`.
Browser SSR uses `X-Grida-Account-Token`. Native reads do no provider work or
privileged fallback. A cached display/gate projection never admits paid work.

`/gateway/manage` retains canonical organization management. It accepts typed
`intent=organization|settings|create-organization`, `return_to`, and matching
existing `org_id`. Current membership is required, and settings requires owner.
Continuation submissions revalidate same-origin and current authority. Creation
returns the retained destination, never a guessed newest organization. The typed
fixture mirrors infra's `contracts/platform/destinations.json`.

`/gateway/account` resolves one opaque 43-character continuation through the
fixed Platform `POST /platform/v1/continuations/resolve` with the SSR workload.
It carries no user/native/console-session headers. Returned navigation must match
the configured console origin, exact continuation endpoint, and typed cancel
destination. Continue enters browser-bound OAuth; a different candidate identity
still requires explicit confirmation. Cancel retains the original console session.
Use another account revalidates raw Origin/Host/Fetch Metadata and continuation,
then signs out only the current Grida web session with Supabase local scope.
The progressive form uses `same-origin` referrer policy and works before hydration.
Expired/unavailable continuation never selects a fallback identity.

## Paid product custody

`platformProductBilling` obtains a fresh complete Platform admission before paid
provider work. `GRIDA_PLATFORM_USAGE_KEY_ID` / `GRIDA_PLATFORM_USAGE_TOKEN` are
separate sending credentials for `platform.billing.usage`.

Service-only `platform_product_execution_*` RPCs persist a claim binding producer,
execution, organization, product, operation/model, policy, and exact `cost_mills`.
Dispatch commits once before the provider call; replay grants no second dispatch.
Completion and usage outbox commit together before a successful synchronous result
or stream finish, including after canonical deletion. Identical receipts replay;
conflicts are rejected. Interrupted streams without trustworthy final evidence
retain a dispatched unknown outcome instead of fabricated zero usage.

Native `cost_mills` is an exact decimal string with up to 18 fractional digits,
separate from GG money. Receipt custody records pricing evidence digests rather
than prompts/result bodies. A billing outage cannot erase a committed receipt.

`POST /internal/platform/products/receipts` accepts only `{limit:1..100}` and
returns current `source_instance`/`source_epoch` plus receipt events. Each event
retains its original execution namespace across restore. `/receipts/ack` accepts
only `{event_ids:[UUID]}` after durable target custody. Neither endpoint accepts
customer credentials, producer selectors, or arbitrary RPC names. Receiving
configuration is `GRIDA_PLATFORM_RECEIPTS_ENVIRONMENT` /
`GRIDA_PLATFORM_RECEIPTS_WORKLOAD_KEYS`, audience `grida.product-receipts`.

## Retained webhook and recovery custody

Released `/webhooks/stripe` and `/webhooks/metronome` URLs verify the exact raw
body and original signature headers, archive durable source capture, forward to
`POST /platform/v1/billing/ingress/source/{stripe|metronome}`, then commit source
ACK after the accepted durable target receipt. Failure never invokes a retired
financial processor. No outbound Stripe/Metronome API key belongs in Grida.

Forwarding uses `GRIDA_PLATFORM_INGRESS_KEY_ID` / `GRIDA_PLATFORM_INGRESS_TOKEN`
for `platform.billing.ingress`. Source `STRIPE_WEBHOOK_SECRET` /
`METRONOME_WEBHOOK_SECRET` remain distinct from new target endpoint secrets and
workload tokens. Previously verified expired requests remain archive evidence
for reviewed import; they are never fabricated fresh vendor deliveries.

Applied source migrations and retained financial/admitted-work/webhook archives
preserve original handoff history and late obligations. They are not runtime
writers or instructions to reactivate source billing. Private operator restore
controls retain the source instance and a never-reused epoch. Fresh authority and
paid dispatch stay quarantined until reviewed reconciliation; accepted completion
and archive custody continue. Receipt IDs and original epochs remain immutable.

## Verification

From the Grida root, run the affected no-env lane:

```sh
node node_modules/vitest/vitest.mjs run --config editor/vitest.api.config.ts editor/lib/platform/canonical.test.ts
node node_modules/vitest/vitest.mjs run --config editor/vitest.platform.config.ts
node node_modules/vitest/vitest.mjs run --config editor/vitest.platform-consumers.config.ts
```

SQL proof uses the complete migration history and seed in a dedicated local
fixture. The real paired HTTP/browser billing workflow is maintained in
[infra's local billing fixture](../../../../infra/integration/local/billing/README.md);
the [private billing index](../../../../infra/docs/platform/billing/index.md) owns
operations and recovery. Source unit success alone proves no SQL locking,
vendor delivery, production cutover, or public publication. Public contributors
can use [the self-contained Grida guide](../../../docs/contributing/billing.md).
