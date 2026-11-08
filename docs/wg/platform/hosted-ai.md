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

### 4. Model facts, offerings and client compatibility

There are three different questions, with different owners:

| Question                                                              | Source                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is this model and what do providers document?                    | The pinned public `@grida/ai-models` release from [Models](https://github.com/gridaco/models).                                                                                           |
| What can GG serve now, with which contract and price?                 | Anonymous [GG models](https://gateway.grida.ai/v1/models), [endpoints](https://gateway.grida.ai/v1/endpoints) and [operation schemas](https://gateway.grida.ai/schemas/operations.json). |
| What does Grida recommend and what can this installed client execute? | `data/ai/presets.json` plus implemented native/BYOK and GG interface adapters.                                                                                                           |

`@grida/ai/catalogue` joins a generated compatibility projection of the external
facts with Grida's product presets. It owns lookup helpers, tier choices and the
retained schema-1 codec; it does not author independent model facts or declare
current GG availability. [The data guide](../../../data/ai/README.md) describes
generation and native snapshots. Ordinary GG additions using an implemented
interface are data updates; new input transports or output representations still
require client code.

**Current GG discovery.** TypeScript consumers and the native CLI read public GG
metadata without credentials. The inventory is intersected with supported client
interfaces; a Vercel binding does not imply GG support. Bounded shared caching
avoids a discovery fetch per generation. Expired data cannot restore a retired
hosted offering from the native bundle. Discovery failure is separate from
provider-key availability, credit eligibility and execution authorization.

**Product choices.** Defaults and tiers remain Grida-owned choices. An optional
default must be active and listed. Explicit saved selections and chosen providers
remain sticky; a recommendation or catalogue refresh does not silently select a
different model, provider or credential. Product-specific background removal and
upscaling remain native feature contracts. Library embedding model, dimensions
and normalization remain persisted-data contracts, not live catalogue defaults.

**BYOK and offline behavior.** The pinned public Models snapshot provides facts
for installed adapters and offline display. Current hosts keep this immutable
release pin rather than refreshing native facts from the legacy HTTP catalogue.
A provider listing cannot manufacture an adapter. Exact provider SKU prices stay
opaque; unqualified inputs are withheld rather than invented. Missing coarse
estimates remain unknown. GG's current tariffs, reservation and settlement are
service-owned; client catalogue costs are display estimates only.

**Installed-client compatibility.** `GET /api/v1/models/catalog` retains the
schema-1 text/image/video distribution protocol for older installed clients. Its
`catalog.snapshot.legacy()` projection omits binding shapes that schema 1 cannot
represent, including opaque SKU prices and absent historical cost estimates,
without changing the current native seed. Existing section replacement and
independent media fallback remain intact. This endpoint does not define current
GG offerings or hosted authorization. Keep its contract until installed consumers
have migrated.

**Accepted work.** A model disappearing from discovery prevents new selection;
it does not erase an accepted job. Status/result recovery preserves the original
job identity and authorization independently of a refreshed catalogue. A lost
result or unavailable metadata never authorizes repeating an accepted paid call.

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
