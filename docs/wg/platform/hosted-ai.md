---
title: Grida Gateway (GG)
description: Grida Gateway (GG) — how an untrusted native client runs Grida-hosted AI without its own API key via scoped-token federation, a first-party metered gateway, and server-side entitlement.
keywords:
  - grida gateway
  - gg
  - hosted ai
  - no-byok
  - ai gateway
  - metered inference
  - scoped token
  - token federation
  - entitlement
  - openai-compatible
  - credential custody
format: md
tags:
  - internal
  - wg
  - platform
  - ai
---

| feature id | status      | description                                                                           |
| ---------- | ----------- | ------------------------------------------------------------------------------------- |
| `gg`       | implemented | No-BYOK AI: scoped-token federation → first-party metered gateway → org-credit spend. |

# Grida Gateway (GG)

Grida's hosted AI is the managed model-capacity option for signed-in product
users. It uses organization AI credits without requiring a personal model key.
The installed `gg` provider uses Grida's native authenticated API; it is distinct
from the standalone customer API at `gateway.grida.ai`.

This page describes the native consumer and catalogue contract. Financial policy,
provider billing and service operations are outside the Grida application.

> **Boundary & surface.** The scoped-token trust boundary is
> **`GRIDA-SEC-006`** in
> [SECURITY.md](https://github.com/gridaco/grida/blob/main/SECURITY.md);
> the code surface is marked `GRIDA-GG` and governed by the `gg` engineering
> skill. This doc explains the domain; SECURITY.md is the enforced
> invariant.

## Architecture

### 3D feature funding

Model generation, compatibility checking and rigging are separate features
within the 3D family. Funding is independent of that feature identity: choosing
organization credits preserves the same model version and supported controls
as a direct provider-key operation. A compatibility check never implicitly
starts a rigging job. ElevenLabs remains outside this funded expansion.

Large input files may travel directly to provider storage under a narrowly
scoped upload capability. That capability authorizes a storage-object upload; it is
not an upstream inference key and cannot spend credits. A separate short-lived
content reference binds the uploaded input to its user and organization. Every
feature invocation must independently authenticate, verify that ownership and
pass the credit gate. A client cannot transfer another tenant's input reference
or supply an arbitrary URL for the gateway to fetch.

Grida's authenticated product adapter submits these paid features to GG, which
meters provider-reported usage and retains original accepted work independently
of a later model download. It does not trust a client-reported cost or create a
second native charge. GG observation/settlement continues after the caller leaves;
missing usage remains unknown and does not authorize regeneration. Grida retains
asset validation/storage and the existing signed direct-upload preparation.
Accepted pre-transition native obligations remain in the
[billing register](./billing/known-issues.md#ki-bill-005--tripo-jobs-without-an-observed-terminal-receipt-need-reconciliation).

## The contract

### 1. The scoped token (federation)

The credential handed to the native process is a **purpose-scoped,
short-lived, organization-bound token**:

- **Purpose-scoped** — an audience claim (`gg:ai`) binds it to Grida
  Gateway and nothing else. It is structurally useless at every other
  endpoint; the account's real session endpoints never even accept it.
- **Short-lived** — on the order of fifteen minutes. **Expiry is the unit
  of revocation**: abandoning a leaked token requires no server-side state.
- **Organization-bound** — it carries the org whose credit will be spent,
  resolved from a verified membership at mint time. The gateway never
  trusts a client-supplied organization id.
- **Minted only from the durable session, same-origin** — the sole place a
  token is created requires a live login and verified org membership. No
  other input can produce one.
- **Custody: memory only** — the renderer handles the token only long enough
  to push it across the authenticated bridge; it never persists, logs, or
  returns it. The native daemon then holds the token in memory and nowhere
  else: never on disk, never persisted, never a refresh token. Electron main
  observes it only while routing an in-flight provider request and has no
  durable credential custody. The webview session remains the _only_ durable
  credential; the renderer re-mints and re-pushes proactively before expiry and
  again on an expiry error.

This credential authorizes only the native AI resource family; it is not a
provider credential or a standalone customer API key.

### 2. The gateway (a first-party metered surface)

A first-party endpoint family authenticated by the scoped token **and
nothing else** — it never accepts a durable session token, a cookie, or an
API key. It presents two contract styles:

- **Text: an OpenAI-compatible surface** — chat completions (streaming and
  non-streaming, with tool-call passthrough and a usage report) plus a
  model list. OpenAI's chat-completions shape is the de-facto industry ABI;
  adopting it verbatim means any conformant client speaks it with no custom
  code, and it is a contract we can honor for years. It is pinned by
  contract tests so it cannot silently drift.
- **Image and video: Grida-native generation surfaces** — request/response
  shapes owned by our own protocol, returning inline results.

### 3. Credit display and execution

Grida displays the organization's credit projection. That observation is not
permission to execute or a settled charge. The execution service owns admission
and charging; consumers preserve its failures and never resubmit accepted work
because a result download failed. See [AI credits](./billing/ai-credits.md).

### 4. Catalogue distribution (credential-free)

The model catalogue is compiled into every client that consumes it, so a
shipped desktop binary can only ever see the catalogue it was built with.
Adding a model or retargeting a tier used to require a release — while the
renderer, served fresh from grida.co, would already be offering the new
model. The result was a client whose own picker offered a model its own
agent host rejected as unknown.

The catalogue is therefore **published, not shipped**: authored in-repo
(it is a curated product decision, not a scrape) and served at
`GET /api/v1/models/catalog`.

**One package, two explicit entries.** The factual `@grida/ai-models` entry
describes identities, capabilities, verified provider bindings, and published
rates independently of Grida. The `@grida/ai-models/grida` service entry selects offerings from those
facts and owns listing, legacy status, request presets, tiers, and presentation
preferences. A legacy offering remains a valid explicit choice; legacy is not
a claim that an upstream provider has retired it. Removing service membership
does not erase factual identity. The root entry never imports or re-exports
service policy. The execution SDK keeps its existing Grida defaults by explicitly
consuming the service entry; hosts do not need to inject a catalog to retain
existing behavior.

**Recommendation is not authorization.** A service family may configure a
default independently from a partial manual order. A default must be listed
and nonlegacy. Presentation places that default first, other active offerings
before legacy offerings, then applies explicit rank and a deterministic label
and identifier tie-break. Unranked members remain present. Explicit user
selections and surface-specific tier choices take precedence over the general
recommendation. Provider availability and implemented adapter capabilities are
checked separately at execution.

- **The published snapshot IS the deployed gate.** That endpoint's body
  and the server's own model allowlist are the same static import in the
  same deploy artifact, so they cannot disagree. This is why the published
  catalogue outranks a client's bundled one even when the binary is newer:
  converging on it is converging on the table that will actually be
  enforced.
- **The bundle is the seed, and the floor.** A host answers from its
  bundled catalogue immediately and forever if the network never comes
  back. A bad snapshot can make a host mis-list; it can never leave one
  with no catalogue at all.
- **Wholesale replacement within each accepted section.** An invalid required
  text section rejects the snapshot. Optional media sections retain the
  independently fallible behavior described below. Each valid section REPLACES
  its catalogue rather than merging: removing a model is the kill switch, and
  a merge would defeat it on every installed client.
- **Credential-free, and outside the token-gated glob.** A desktop
  sidecar fetches this at boot, long before a renderer can push a
  signed-in session token, so the route must accept no credential — while
  `GRIDA-SEC-006` binds every `api/v1/ai` route to `verifyGgToken`
  exclusively. Accepting no credential is stronger than accepting the
  wrong one, but only while this route stays outside that family.
- **Pricing is included, deliberately.** The "no pricing" rule on
  `/api/v1/ai/models` guards the OpenAI-compatible surface against
  client-side cost math drifting from the billing rail. This payload is
  the source that FEEDS a host's local estimate and its compaction limits;
  withholding rates is what would cause drift. The same numbers are
  already public on the models page and in the pricing docs.

**Convergence.** A host refreshes at boot, on an interval, and once when a
lookup misses. The miss refresh is the load-bearing one: it is awaited
in-request, so the FIRST use of a newly published model succeeds instead of
failing until some later tick. It is deliberately modality-agnostic — an
image card the renderer just offered is exactly as publishable-since-boot
as a text model, and both are reached through a picker served fresh from
grida.co. A tier retarget produces no miss (the old target is still
valid), so it converges on the interval instead.

**Membership is asked exactly; identity is asked loosely.** A view answers
two different questions and a call site must not confuse them. `has` is
exact catalogue membership — the question a GATE asks, because whatever
passes a gate is forwarded to a provider verbatim and only an exact
catalogue id is one the provider recognizes. `modelSpecById` also matches
a bare name and a date suffix — right when asking for a model's LIMITS or
RATES, where a near-miss id is still that model. Using the loose one to
gate silently widens what the host admits and converts a clean
"unknown model" rejection into a provider-level failure mid-run.

**Pinning.** `GRIDA_AGENT_DISABLE_MODELS_FETCH=1` freezes a daemon on its
bundled catalogue — the one hatch for an air-gapped or version-pinned
deployment. It works by handing the store the seed as its snapshot, which
is the same mechanism that pins it to any supplied catalogue, so there is
one code path rather than a family of overrides.

**Schema.** Additive changes do not bump the schema major — clients ignore
fields they do not know, so a new optional field is safe to publish. A
breaking change publishes at a NEW path and bumps the major, leaving old
clients on the old path or falling back to their seed. One rule follows
from that: a model requiring new CLIENT CODE (a new provider kind) must
never be published into an existing schema, because old clients will
accept its data and then fail to drive it. Ordinary models are pure data
and need no accompanying release.

**Sections are independently fallible.** `text`, `image`, and `video` are
validated separately: an unusable media section is dropped on its own and
the consumer falls back to its bundled catalogue for that modality only.
Only `text` is load-bearing enough to reject the whole payload, because a
host with no text catalogue cannot run a turn at all. A broken image
catalogue must never cost a host its ability to answer.

**Schema-1 recommendations are additive.** Older clients ignore optional
default and order fields; their existing membership and lifecycle fields must
retain their meanings. Newer readers resolve recommendations against the same
effective section as its model bindings. When a media section is dropped, its
remote recommendations are dropped with it. The schema does not distinguish
independent GG and BYOK service membership; server-side provider and request
gates remain authoritative. Catalog data cannot add adapter code to an
installed client.

**Not every modality is published yet.** `text`, `image`, and `video` are.
Music, sound effects, and 3D are still gated against the host's BUNDLED
catalogue (`v.oneOf(models.audio.music.model_ids)` and its siblings in
`packages/grida-ai-agent/src/http/routes/`), so adding a model in those
families still needs a desktop release.

That is a known gap, but it is NOT one more section away. Image and video
cards fit the published shape because they carry open id unions,
`listed: boolean`, and a `providers` map keyed by provider — which is what
the media view is generic over. Music, sound-effect, and 3D cards carry
closed literal id unions, a single `provider` field, and `status:
"listed" | "staged"`, and their routes gate at body-validation level on the
narrowed id (`three-d.ts` then indexes the card to drive per-model input
validation). Publishing them means first changing those card shapes in
`@grida/ai-models` — widening the id unions, reconciling `status` with
`listed`, deciding whether a single-provider card grows a providers map —
and only then adding a section. Two instantiations is also the minimum
that justifies the current generic; stretching it over a third,
incompatible shape before there is demand would be speculative. Image and
video move monthly and are multi-provider; these three move roughly
yearly and are single-provider hosted routes. Worth revisiting when one of
those catalogues starts moving.

**Closed vocabularies are validated as text on the wire.** Model vendor,
speed label, and the like are closed unions in TypeScript but are accepted
as plain strings when parsed, and an unknown _provider_ binding is dropped
rather than rejecting its card. Otherwise publishing a model from a new
vendor, or adding a provider, would be a breaking publish requiring a
client release — the exact failure this system exists to remove. (Vercel AI
Gateway learned this in public: it validated its model-kind field as a
hard enum, so the day a new kind shipped the entire listing failed to
parse for every client. It now accepts loosely and filters unknown rows.)

### 5. Relationship to provider selection

GG is one native capacity source; it does not own the global provider order.
The golden selection rules live in the
[ChatGPT subscription provider specification](../ai/agent/chatgpt-subscription-provider.md#provider-selection):

- an explicit provider or explicitly changed model is an intentional switch;
- otherwise a persisted provider remains sticky while the model is omitted or
  unchanged;
- a fresh, unconfigured session uses a ready ChatGPT subscription connection
  first;
- otherwise the existing text fallback remains BYOK, then GG, then configured
  endpoint/local capacity;
- a provider failure never silently changes provider in the middle of a turn.

This preserves GG as the managed no-key route without overriding an existing
user's chosen BYOK, endpoint, local, or GG route.

## Security boundary

The trust boundary is registered as **`GRIDA-SEC-006` — Hosted-AI
scoped-token boundary**. Its one-sentence invariant:

> The credential a native process holds for AI must be worth **at most
> fifteen minutes of AI calls billed to an org the user was a member of —
> and nothing more.**

It composes with the neighboring boundaries: the durable webview login is
`GRIDA-SEC-005`; the native daemon's trust perimeter is `GRIDA-SEC-004`;
the server-side org-id trust resolution that the mint reuses is
`GRIDA-SEC-003`. The doctrine amendment those records carry is: _the
sidecar may hold the short-lived scoped AI token (memory-only), and nothing
more durable._ The enforced details — signing, audience pinning,
fail-closed secret handling, rotation, rate limiting — live in
[SECURITY.md](https://github.com/gridaco/grida/blob/main/SECURITY.md).

## Scope boundary: capacity, not remote execution

Hosted AI provides **model capacity only**. The agent loop — prompt
composition, tool authority, session recording, workspace and filesystem
access, abort propagation — **stays local** to the native host. File
contents reach a hosted model only as ordinary model-call content produced
by the local loop.

Remote-running the agent itself (a true "cloud agent runtime," or a hosted
agent behind a CLI) is a **separate, still-deferred concern** and must not
be conflated with hosted model provision. Hosted AI moves the _model call_
off-device; it does not move the _agent_ off-device.

## Verification scope

Native client/API contracts, scoped-token custody and consumer behavior have
focused local tests. A local result does not establish hosted configuration or
packaged-network qualification. Standalone service releases and their financial
operations are separate from this consumer contract.

## Related

- [AI credits](./billing/ai-credits.md) — product credit display and execution custody.
- [Platform integration](../../contributing/billing.md) — local consumer development.
- [SECURITY.md](https://github.com/gridaco/grida/blob/main/SECURITY.md) —
  `GRIDA-SEC-003`/`004`/`005`/`006`, the enforced boundaries.
- [Deferred Grida Cloud Agent Provider](https://github.com/gridaco/grida/blob/main/docs/wg/platform/_history/hosted-ai-deferred-provider-2026-06.md)
  — the unlisted superseded pre-build design, kept for lineage.
