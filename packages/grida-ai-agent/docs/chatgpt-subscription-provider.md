# ChatGPT subscription provider

`@grida/agent` can consume an eligible ChatGPT account as a native text-model
provider. Grida continues to own the model loop, tools, approvals, sessions,
and persistence. This path never launches Codex app-server and never enters
the external agent-provider/ACP branch.

The provider is dormant unless a Node host passes `chatgpt` in
`AgentTenantOptions`. The host supplies a `ChatGptProviderConfig` containing:

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

When configured, the agent tenant mounts authenticated, sidecar-private POST
routes under `/auth/chatgpt/*`:

| Route      | Purpose                                                   |
| ---------- | --------------------------------------------------------- |
| `start`    | Validate a configured redirect URI and create PKCE state. |
| `complete` | Exchange one valid callback code and persist credentials. |
| `cancel`   | Invalidate the named pending attempt.                     |
| `status`   | Return the secret-free subscription status DTO.           |
| `sign-out` | Remove the persisted credential and pending attempt.      |

These routes deliberately do not appear in `AgentTransport`. A trusted native
host drives the system-browser and loopback-callback ceremony with the
daemon's low-level authenticated fetch. A renderer may receive only
`ChatGptSubscriptionStatus`; it never receives the authorization code, state,
PKCE verifier, access token, or refresh token.

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
daemon-owned `AuthStore`. The shared store serializes mutations with BYOK
records and preserves the existing owner-only file permission and atomic-write
contract.

Access-token refresh is single-flight. A rotating refresh token is durably
written before the corresponding access token can be used. Sign-out advances
a generation guard so an exchange or refresh already in flight cannot restore
a deleted credential.

Inference reads credentials inside the Node tenant. It injects:

- `Authorization: Bearer …`;
- the account-scoping header from the authenticated token claims;
- the configured product originator; and
- the subscription Responses compatibility header.

Provider responses and token-endpoint bodies are never copied into public
auth errors. Refresh or inference authentication failure is terminal for the
selected provider; the runtime does not silently move the turn to another
provider.

## Model and provider resolution

An explicitly requested provider always wins. An explicitly changed model is
an intentional re-resolution request and may switch to another compatible
provider. Otherwise a persisted provider remains sticky while the model is
omitted or unchanged. For a fresh, provider-unqualified text session, a
configured and ready ChatGPT provider is considered before the existing BYOK
→ Grida Gateway → endpoint fallback order.

Compatibility is checked before selection. Grida session and renderer ids
remain namespaced (`openai/gpt-…`); the server-only adapter maps the closed
supported set to the bare model names required by the subscription backend:

- `openai/gpt-5.6-sol`;
- `openai/gpt-5.6-terra`;
- `openai/gpt-5.6-luna`;
- `openai/gpt-5.5`;
- `openai/gpt-5.4`;
- `openai/gpt-5.4-mini`.

This allowlist mirrors the current observed Zed/Codex-compatible surface. It
is not authenticated model discovery, may drift, and cannot prove that a
particular account is entitled to every listed model. Unsupported ids fall
through only while the session is still unqualified. An explicit or persisted
`chatgpt` choice fails with `provider_down` or a typed provider error instead
of changing capacity source.

The selected provider/model pair is reused for continuation and queued work.
Compaction and title generation stay on the same provider and credential/cost
boundary, while intentionally using that provider's low-cost `nano` tier.
Auxiliary work must not create an unqualified second provider resolution.

## Network authority

OAuth exchange, refresh, and Responses inference use the injected
`provider_http` request operation. Desktop routes that operation through its
main-owned provider network service. Standalone hosts may omit the transport
and use the package's existing ambient-request behavior, but still own
destination policy and OAuth activation.

The Responses adapter accepts one exact credential-free HTTPS `/responses`
URL and refuses any other destination before credentials are attached. It
forces `store: false` and lowers Grida's system prompt to the top-level
Responses `instructions` field required by the subscription wire.

## Boundaries

The Desktop binding is part of the active
`GRIDA-SEC-008: ChatGPT subscription OAuth credential boundary`. The security
tag covers the exact callback, renderer-safe status, sidecar credential
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
