# ChatGPT subscription provider

`@grida/ai-host/chatgpt-host` exports `ChatGptSubscriptionHost`, which lets a
trusted native host use an eligible ChatGPT account as a text-model provider
for the native agent. The native agent continues to own the model loop, tools,
approvals, sessions, and persistence. This path never launches Codex
app-server and never enters the external ACP agent branch.

One host process constructs the subscription host with these options:

- `userDataPath` — the absolute, normalized directory whose `AuthStore` holds
  the credential;
- `post` — the host's narrow request callback for the two fixed destinations,
  the token endpoint and the subscription Responses endpoint. It returns the
  provider response, or `null` when the host refuses or cannot dispatch;
- `getModels` — optional, fixed authenticated GET of the subscription model offer;
- `turnPreferences` — optional callback that supplies the current
  `webSearchAllowed` permission; and
- `configuration` — a `ChatGptProviderConfig` containing:

- the exact authorization and token endpoints;
- the public native OAuth client id and fixed loopback redirect URIs accepted
  by that configured client profile;
- the exact subscription Responses endpoint;
- the configured product originator;
- the default model, from the generated subscription compatibility projection.

No client secret is accepted. The package generates PKCE verifier/challenge
and state values for each launch-scoped attempt.

Desktop's current experimental host binding defaults to the public Codex
native client id `app_EMoamEEZ73f0CkXaXp7hrann`, with
`GRIDA_CHATGPT_OAUTH_CLIENT_ID` as the replacement seam for a host-owned
registration. It pins:

- `https://auth.openai.com/oauth/authorize`;
- `https://auth.openai.com/oauth/token`;
- `https://chatgpt.com/backend-api/codex/responses`; and
- `http://localhost:1455/auth/callback`, with port `1457` as the registered
  fallback.

This is an experimental interoperability posture, not a claim that the public
client identity is Grida-owned or that OpenAI approves/supports Grida.

## Native-host auth seam

`ChatGptSubscriptionHost` exposes the ceremony as direct calls, without an HTTP
listener or route. Their string inputs are non-empty and total at most 32 KiB:

| Call       | Purpose                                                   |
| ---------- | --------------------------------------------------------- |
| `start`    | Validate a configured redirect URI and create PKCE state. |
| `complete` | Exchange one valid callback code and persist credentials. |
| `cancel`   | Invalidate the named pending attempt.                     |
| `status`   | Return the secret-free subscription status DTO.           |
| `signOut`  | Remove the persisted credential and pending attempt.      |

These calls never appear in a renderer transport. The trusted native host
drives the system-browser and loopback-callback ceremony through them. A
renderer may receive only `ChatGptSubscriptionStatus`; it never receives the
authorization code, state, PKCE verifier, access token, or refresh token.

The callback listener is a host concern. The package validates the exact
redirect URI again before constructing the authorization URL, consumes a
matching attempt only once, and persists the refreshable credential before
reporting a successful completion.

The current profile does not send an OIDC nonce and does not independently
verify JWT signature, JWKS, issuer, or audience. Bounded account/display
claims are parsed only from the response returned by the exact configured
TLS-authenticated token endpoint. Trust comes from that pinned endpoint and
the platform TLS trust path; callback, renderer, project, and imported
credential data are never accepted as claim sources.

## Credential lifecycle

The provider stores one OAuth record under the `chatgpt` provider id in the
daemon-owned `AuthStore`. OAuth remains in `auth.json`, owner-only on macOS/Linux
and subject to inherited native ACLs on Windows.
GRIDA-SEC-014 moves macOS/Linux API keys into separate shared TOML custody. Updated
macOS/Linux OAuth mutations and one-time BYOK retirement share a process lock,
preserving OAuth records and atomic writes through migration; Windows retains
its host-local API-key/OAuth backend without claiming this new process-lock
guarantee. Provider mutations preserve the OAuth record.

Access-token refresh is single-flight. A rotating refresh token is durably
written before the corresponding access token can be used. Sign-out advances
a generation guard so an exchange or refresh already in flight cannot restore
a deleted credential.

Each subscription request reads credentials inside the subscription host,
which injects:

- `Authorization: Bearer …`;
- the account-scoping header from the authenticated token claims;
- the configured product originator; and
- the subscription Responses compatibility header.

Provider responses and token-endpoint bodies are never copied into public
auth errors. Refresh or inference authentication failure is terminal for the
selected provider; the native agent does not silently move the turn to another
provider.

## Native inference

The host exposes three operations for trusted subscription routing.

- `scope()` reads the current sign-in lineage locally so the caller can
  reject a choice captured under another account before issuing a request.
- `inventory()` returns the visible selectors offered by the signed-in
  account and an opaque scope for that sign-in. It distinguishes an empty
  account offer, a discovery failure and a sign-in that needs attention.
  Desktop joins the selectors to one public Models V2 release to obtain the
  canonical chat IDs and supported native capabilities.
- `capture(modelId, binding)` binds the exact subscription wire selector to
  that account. A replaced sign-in or a selector absent from the account
  offer cannot authorize dispatch. The captured connection returns the fixed
  Responses target, wire selector and a `request(body, signal)` function.

Desktop passes the canonical model, resolved wire selector and opaque
subscription scope privately to the supervised native process. The native
adapter sends each request through
[supervised provider egress](../../../crates/grida-agent/docs/rust-client-protocol.md#supervised-provider-egress)
with only `Content-Type` and `Accept` headers. Main accepts the exact target
and header set and attaches the credential inside the captured connection.

The connection refuses any body that departs from the native request shape:
the captured model, streaming, `store: false`, string `instructions`, and
encrypted reasoning as the only included field. Alongside ordinary functions
it can offer one `web_search` tool on a compatible model. New search requests
set `external_web_access: true`. The validator also accepts previously
captured cache-only and index-gated requests with their original limits.
Accelerated speed uses `service_tier: "priority"` or `"ultrafast"` and
requires an offer for the captured account and model. The credential owner
checks current search permission on each POST attempt that includes search.
Revoking search permission or failing to read it can block a previously
accepted request that uses search. A connection captured under a replaced
account lineage answers `401` without dispatch, and a new capture yields
a different scope.

The canonical chat model ID and the subscription selector may differ. The
selected public ID identifies the user's model in the chat while the captured
selector identifies the model on the provider request. An accepted input
keeps its captured selector when a public release changes the mapping. The
signed-in account must still offer that selector.

### Optional features on the selected connection

The subscription host reads the signed-in account's fixed
`GET /backend-api/codex/models?client_version=…` through Main. Accelerated
speeds require both the public agent entry and a compatible tier in the
authenticated offer. The verified full HTTP Responses hosted search profile
currently covers GPT-6.2 Sol. Search also requires the user's current
permission.

Concurrent requests share one discovery read per sign-in lineage. Successful
offers expire after five minutes. Discovery failures briefly suppress retries
and withhold new choices. An old sign-in's response cannot repopulate the
current offer. Raw account data, provider instructions and credentials stay in
the host.

### Update membership and the default

Desktop reads canonical text model facts from `models.json` and subscription
selectors from the OpenAI Codex entry in `agents.json` of the same public
Models V2 release. The picker lists compatible models that the current account
offers. A new compatible selector can become usable when the catalogue
refreshes. Adding a wire protocol or changing Grida's verified search
compatibility still requires an adapter change.

[`data/ai/chatgpt-subscription.json`](../../../data/ai/chatgpt-subscription.json)
owns the product default and historical retired IDs. The default is recommended
when available. Saved choices whose model or account is unavailable require an
explicit replacement. The host also supports the bundled compatibility map
for callers that supply only a model ID. See the
[catalogue update workflow](../../../data/ai/README.md) for generating and
checking the offline seed and compatibility projections.

## Network authority

OAuth exchange, refresh, and inference use the host's fixed `post` callback.
Authenticated model discovery uses its separate `getModels` callback. Desktop
routes both through its Main-owned provider network service. The subscription
host refuses any other destination or request shape before credentials are
attached.

The native Responses adapter sends stateless requests (`store: false`) and
places Grida's system instructions in the top-level `instructions` field
required by the subscription wire.

## Boundaries

The Desktop binding is part of the active
`GRIDA-SEC-008: ChatGPT subscription OAuth credential boundary`. The security
tag covers the exact callback, renderer-safe status, host-owned credential
lifecycle, and destination-bound provider transport. It does not turn the
experimental OAuth/backend profile into a supported public OpenAI contract.

- ChatGPT subscription capacity is text-model capacity. Image input support
  on a text model does not authorize image or video generation.
- This package does not import or inspect Codex CLI/Desktop credential files.
- A stable legal/support contract with OpenAI is an external release gate.
  Shipping the adapter and its public-client default does not claim that an
  arbitrary client id/redirect is accepted or that Grida is approved.
- The at-rest store currently inherits `AuthStore`'s owner-only file boundary.
  Moving OAuth records to an OS keychain is a future host/storage change, not
  a reason to expose them through the renderer.
