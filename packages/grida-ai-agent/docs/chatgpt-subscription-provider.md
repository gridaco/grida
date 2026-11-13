# ChatGPT subscription provider

`@grida/agent/chatgpt-host` exports `ChatGptSubscriptionHost`, which lets a
trusted native host use an eligible ChatGPT account as a text-model provider
for the native agent. The native agent continues to own the model loop, tools,
approvals, sessions, and persistence. This path never launches Codex
app-server and never enters the external ACP agent branch.

One host process constructs the subscription host with three options:

- `userDataPath` — the absolute, normalized directory whose `AuthStore` holds
  the credential;
- `post` — the host's narrow request callback for the two fixed destinations,
  the token endpoint and the subscription Responses endpoint. It returns the
  provider response, or `null` when the host refuses or cannot dispatch; and
- `configuration` — a `ChatGptProviderConfig` containing:

- the exact authorization and token endpoints;
- the public native OAuth client id and fixed loopback redirect URIs accepted
  by that configured client profile;
- the exact subscription Responses endpoint;
- the configured product originator;
- default and tier model choices from the package's closed, client-safe
  `CHATGPT_SUBSCRIPTION_MODEL_IDS` set.

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

`capture(modelId)` binds one supported model to the current credential lineage
and returns a connection with the fixed Responses `target`, the bare wire
`model`, an opaque 64-hex `scope` for that account lineage, and a
`request(body, signal)` function. The scope carries no credential or account
identifier.

Desktop launches the native host with `serve --stdio --supervised-provider
--supervised-chatgpt-scope <scope>` and the Responses provider. The native
adapter prepares each request and sends it over the
[supervised provider egress](./rust-client-protocol.md#supervised-provider-egress)
with only `Content-Type` and `Accept` headers and no credential. Main accepts
only that exact target and header set, then passes the body to the captured
connection, which attaches the credential headers above.

The connection refuses any body that departs from the native request shape:
the captured model, streaming, `store: false`, string `instructions`, function
tools only, and encrypted reasoning as the only included field. A connection
captured under a replaced account lineage answers `401` without dispatch, and
a new capture yields a different scope.

Grida session and renderer ids remain namespaced (`openai/gpt-…`). The native
host maps the closed supported set to the bare model names required by the
subscription backend and refuses any other model:

- `openai/gpt-5.6-sol`;
- `openai/gpt-5.6-terra`;
- `openai/gpt-5.6-luna`;
- `openai/gpt-5.5`;
- `openai/gpt-5.4`.

This allowlist reflects the models the subscription backend currently accepts.
It is not authenticated model discovery, may drift, and cannot prove that a
particular account is entitled to every listed model.

## Network authority

OAuth exchange, refresh, and subscription requests use the host's `post`
callback and nothing else. Desktop routes it through its Main-owned provider
network service, limited to the token and Responses endpoints. The subscription
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
