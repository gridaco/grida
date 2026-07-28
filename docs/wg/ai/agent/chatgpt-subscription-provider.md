---
title: ChatGPT Subscription Native Provider Specification
description: Normative contract for using an eligible ChatGPT account as native Grida model capacity while Grida retains ownership of the agent loop, tools, and sessions.
keywords:
  [
    agent-system,
    native-provider,
    openai,
    chatgpt,
    chatgpt-subscription,
    codex,
    oauth,
    acp,
    byok,
    first-party-gateway,
    image-generation,
  ]
format: md
tags:
  - internal
  - wg
  - ai
---

# ChatGPT Subscription Native Provider Specification

This guide defines how to implement a **ChatGPT Subscription native
provider**: a native model provider that lets a user sign in with an
eligible ChatGPT account and use that account for the host's own agent
loop.

This is not the OpenAI API-key provider, not the first-party gateway, and
not Codex ACP. It is a fourth surface:

| Surface                              | User intent                                      | Loop owner | Spend/account owner         |
| ------------------------------------ | ------------------------------------------------ | ---------- | --------------------------- |
| First-party gateway (GG)             | "Use the default first-party AI experience."     | Host       | Host / organization credit  |
| OpenAI API-key / BYOK provider       | "Use my OpenAI API billing account or endpoint." | Host       | User's OpenAI API account   |
| ChatGPT Subscription native provider | "Use my ChatGPT plan without an API key."        | Host       | User's ChatGPT account/plan |
| Codex ACP provider                   | "Run Codex itself as the external coding agent." | Codex      | User's Codex/OpenAI config  |

The important implementation rule is simple:

> A ChatGPT subscription can authenticate a native model provider only
> for the entitlement-bounded ChatGPT/Codex inference surface. It does
> not become an OpenAI API key, and it does not become Codex ACP.

In Grida this rule is stronger: the provider is **never ACP**. Grida owns
the session, agent loop, prompts, tools, approvals, sandbox, transcript,
compaction, and recovery. ChatGPT supplies model capacity only.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and
**MAY** are used as in
[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## Source Reality

OpenAI's public documentation establishes the surrounding product facts:

- Codex supports ChatGPT sign-in and API-key sign-in as separate auth
  modes; ChatGPT sign-in uses ChatGPT plan/workspace access, while API
  key sign-in uses OpenAI Platform billing and policies. See
  [Codex Authentication](https://developers.openai.com/codex/auth).
- Codex is included in ChatGPT plans, and API-key usage follows API
  pricing/model availability instead. See
  [Codex Pricing](https://developers.openai.com/codex/pricing).
- Codex model availability is documented separately from the public API
  model list. See
  [Codex Models](https://developers.openai.com/codex/models).
- Codex CLI login exposes ChatGPT, API-key, and access-token modes. See
  [Codex CLI reference](https://developers.openai.com/codex/cli/reference).
- Public OpenAI image generation is an API feature through the Images API
  or the Responses API image generation tool. See
  [Image generation](https://developers.openai.com/api/docs/guides/image-generation)
  and the
  [image generation tool](https://developers.openai.com/api/docs/guides/tools-image-generation).

Those docs do **not** make a ChatGPT subscription equivalent to the
public OpenAI API. A native provider that uses ChatGPT sign-in therefore
MUST treat its model endpoint, token audience, model list, quota, and
media capabilities as a provider-specific integration contract.

OpenAI's public documentation describes ChatGPT sign-in for its supported
Codex clients. It does not publish a general third-party OAuth registration or
subscription-backend contract.

The current Grida implementation is therefore an **experimental
interoperability profile**. It defaults to the publicly shipped Codex native
OAuth client identity, pins the observed OpenAI authorization/token and
ChatGPT Responses destinations, and allows a host-owned client-id override.
That public client identity is not a secret, but using it is also not evidence
that OpenAI has approved, supports, or contracts with Grida. Grida MUST NOT
describe it as Grida-owned or provider-approved.

The stable legal/support contract with OpenAI remains an external release
gate. Until it is resolved, the provider MUST remain explicitly experimental.
The implementation still MUST NOT import another application's stored
credentials, read Codex auth files, scrape ChatGPT browser state, or present
observed behavior as a durable public API.

## Ownership Model

The provider is native only if the host owns the loop.

| Concern            | ChatGPT Subscription native provider         | Codex ACP provider                         |
| ------------------ | -------------------------------------------- | ------------------------------------------ |
| Session            | Host session                                 | Codex session surfaced through ACP         |
| Prompt assembly    | Host                                         | Codex                                      |
| Tool policy        | Host                                         | Codex, optionally with ACP-forwarded tools |
| Filesystem/sandbox | Host runtime                                 | Codex runtime                              |
| Model call         | Host calls a ChatGPT/Codex inference surface | Codex calls its own model surface          |
| Auth state         | Host-managed ChatGPT provider sign-in        | Codex-native sign-in/config                |
| Stream             | Host-native turn stream                      | ACP event/session stream                   |
| Inspection         | Host-native turn inspection                  | External-agent transcript/ACP inspection   |

The host MUST show this boundary in UX. A user who signs in to ChatGPT for
the native provider has not configured Codex ACP. A user who logs in to
Codex ACP has not configured the native provider.

## User Flow

The expected user flow is:

1. User opens **Settings → LLM Providers → ChatGPT Subscription**.
2. App explains the contract:
   - uses the user's ChatGPT subscription;
   - does not require an OpenAI API key;
   - does not configure Codex ACP;
   - does not imply image generation unless listed as supported.
3. User clicks **Sign in with your ChatGPT account**.
4. App opens the exact configured browser sign-in flow.
5. User completes ChatGPT/OpenAI account login and workspace selection.
6. Browser returns to the app through the configured callback flow.
7. App stores the resulting credential in an owner-readable local secret
   store.
8. App validates model selection against its closed compatibility catalog.
9. App marks the provider connected and shows its compatible models first in
   the native text-model picker.
10. A model-picker choice records both the ChatGPT provider and the selected
    model; the app never infers provider identity from an `openai/*` model id.
11. User may sign out from the same provider settings panel.

For a new Desktop user with no persisted provider choice, onboarding SHOULD
offer this provider first. Skipping, cancelling, or failing sign-in MUST keep
onboarding usable. A fresh unconfigured session uses a ready ChatGPT
Subscription connection first; otherwise it preserves the existing native
fallback order: text BYOK, then Grida Gateway, then a configured endpoint/local
provider. A persisted provider remains sticky while its model is omitted or
unchanged. An explicit provider or explicitly changed model is intentional
user input and MAY select a different compatible provider.

## Auth Flow

The auth flow SHOULD be browser-based and PKCE-style:

```text
App
  |
  |-- create auth request
  |     - random state
  |     - PKCE verifier/challenge
  |     - redirect URI fixed by the configured native profile
  |
  |-- open browser
  |
  v
OpenAI / ChatGPT sign-in
  |
  |-- user authenticates
  |-- user chooses account/workspace when applicable
  |
  v
Redirect callback
  |
  |-- validate state
  |-- exchange authorization result through the pinned token flow
  |
  v
Credential store
  |
  |-- persist token material outside project files
  |-- record account/workspace display metadata
```

Implementation requirements:

| Step              | Requirement                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser launch    | The app SHOULD use the system browser, not an embedded password form.                                                                                                                                     |
| CSRF protection   | The app MUST bind the callback to a random state value.                                                                                                                                                   |
| PKCE              | The app MUST use PKCE S256 for the installed-app flow.                                                                                                                                                    |
| Redirect handling | The redirect URI MUST be fixed by the configured public-client profile. A loopback installed-app callback may be used only when that profile accepts it; Grida MUST NOT reuse its separate custom scheme. |
| Token exchange    | The app MUST use only the pinned HTTPS token flow. It MUST NOT scrape ChatGPT cookies or ask the user to paste private browser tokens.                                                                    |
| Token custody     | Access/refresh material MUST live in an OS credential store or equivalent secret store, not in project settings.                                                                                          |
| Display metadata  | The app MAY store non-secret metadata such as email, account id, or workspace label for UI.                                                                                                               |
| Sign out          | Sign out MUST clear local credential material and provider connection state.                                                                                                                              |

The current experimental profile uses state and PKCE S256; it does not send an
OIDC nonce and does not independently verify a JWT signature, JWKS, issuer, or
audience. Account/display claims are parsed only from the bounded response
returned by the exact configured HTTPS token endpoint. Trust therefore comes
from the pinned endpoint and the platform TLS trust path, not from a second
JWT-verification layer. No callback, renderer value, project data, or imported
credential is treated as an account claim.

This trust posture is an explicit experimental constraint, not a general OIDC
recommendation. A supported OpenAI contract may add a verifiable ID-token or
authenticated account endpoint; adopting it would strengthen the profile
without changing the native-provider ownership model.

If the experimental ChatGPT/Codex token flow is unavailable, the user may
explicitly choose Grida Gateway, OpenAI API-key/BYOK, a configured
endpoint/local provider, or an external agent. Codex ACP is never an automatic
fallback.

## Credential Management

The provider SHOULD maintain this credential state:

| Field              | Secret | Purpose                                             |
| ------------------ | ------ | --------------------------------------------------- |
| Access token       | yes    | Authorizes provider requests.                       |
| Refresh token      | yes    | Renews the access token when permitted.             |
| Expiry timestamp   | no     | Lets the app refresh before a turn begins.          |
| Account id         | no     | Distinguishes signed-in accounts/workspaces.        |
| Email/display name | no     | Helps the user recognize the connected account.     |
| Workspace id/label | no     | Helps avoid cross-workspace confusion when present. |

The host SHOULD refresh before starting a turn when the token is near
expiry. Concurrent turns SHOULD share one refresh operation instead of
starting multiple token refreshes. A fatal auth failure SHOULD clear the
credential and require the user to sign in again.

On an inference `401`, the provider SHOULD first reload newer persisted
same-account state, then perform one serialized forced refresh if needed, and
replay the request at most once. A rotated refresh credential MUST be
persisted atomically before use continues. Sign-out or account change MUST win
over in-flight refresh work.

Auth error handling:

| Failure                         | App behavior                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------- |
| User cancels login              | Return to disconnected state; do not show provider as broken.                     |
| Callback state mismatch         | Reject the callback and restart sign-in.                                          |
| Token expired, refresh succeeds | Continue the pending turn.                                                        |
| Refresh rejected                | Clear credential, mark disconnected, ask user to sign in again.                   |
| Entitlement rejected            | Keep sign-in if valid, explain that the selected model/capability is unavailable. |
| Network failure                 | Preserve credential, show retryable provider error.                               |

Secrets MUST NOT be written to logs, synced settings, project files,
diagnostic exports, or model-visible transcripts.

## Capability Resolution

The provider MUST resolve a ChatGPT/Codex-specific capability surface
instead of reusing the public OpenAI API model list.

Capability resolution SHOULD answer:

- which model ids can be selected;
- which model should be the default;
- which model should be the fast/default-light option;
- whether image input is supported;
- whether direct image generation is supported;
- whether video/audio generation is supported;
- whether tool calling is supported through the host loop;
- what context and output limits apply on this surface;
- whether priority/fast processing is available.

Dynamic, authenticated capability discovery remains the preferred stable
contract. The current experimental implementation has no such surface. It
uses a closed, fail-before-network model allowlist that mirrors the currently
observed Zed/Codex-compatible subscription surface. That list is compatibility
evidence, not entitlement discovery or an upstream guarantee: it may drift,
and an account may reject a listed model. Any change to the list requires a
grounded compatibility update rather than assuming parity with the public
OpenAI API.

The absence of an approved discovery/catalog contract is part of the external
stable-release gate. Upstream rejection is an entitlement/capability error
rather than an API-key error.

Model ids that look similar to OpenAI API model ids MUST still be scoped
to this provider. The same string can have different availability,
context, quota, or capability semantics on the ChatGPT/Codex surface than
on the public API surface.

## Request Flow

For each native turn:

1. Resolve the selected provider/model.
2. Ensure the ChatGPT credential is present and fresh.
3. Resolve or validate the model/capability surface.
4. Build the host-native request:
   - host system prompt;
   - host-composed user message;
   - host tool declarations;
   - host policy/sandbox state;
   - host media inputs, if supported.
5. Send the request to the ChatGPT/Codex inference surface.
6. Map the stream into the host's native turn parts.
7. Persist and inspect the turn as a host-native session.

The host MUST NOT hand the turn to Codex ACP merely because the upstream
surface is Codex-backed. If the external agent owns the run, the user is
in the Codex ACP provider path, not the ChatGPT Subscription native
provider path.

## Host Requirements

A conforming host:

- MUST put ChatGPT Subscription under **LLM Providers** or the
  equivalent native model-provider surface;
- MUST keep Codex ACP under **ACP** or the equivalent external
  agent-provider surface;
- SHOULD make **Sign in with your ChatGPT account** the first provider action
  for a new, unconfigured Desktop user;
- MUST present a ready ChatGPT connection as a distinct, first native-provider
  group in the text-model picker;
- MUST present Grida-hosted models in an always-visible **Grida** group whose
  choices explicitly select the credit-backed `gg` provider;
- MUST show BYOK and compatible endpoint groups only after that provider is
  configured with usable text models;
- MUST bind a ChatGPT picker choice to both provider and model identity rather
  than inferring the provider from an OpenAI-shaped model id;
- MUST preserve a persisted provider choice while the model is omitted or
  unchanged;
- MUST treat an explicit provider or explicitly changed model as an
  intentional switch request;
- SHOULD show the signed-in ChatGPT account/workspace label;
- SHOULD show the selected model as `provider/model`, not as a global OpenAI API
  model;
- MUST give auth errors ChatGPT-specific copy;
- MUST give entitlement errors model/capability-specific copy;
- MUST provide an explicit sign-out control;
- MUST NOT silently switch provider in the middle of a turn;
- MUST keep secrets in the platform secret store;
- MUST keep host-native turns inspectable in the normal agent transcript.

Suggested settings copy:

```text
Sign in with your ChatGPT account to use eligible models through your
ChatGPT subscription. Grida still owns the agent, tools, and session. This
does not configure an OpenAI API key or Codex ACP.
```

Suggested disconnected error:

```text
Your ChatGPT session is missing or expired. Sign in again from Settings
→ LLM Providers → ChatGPT Subscription.
```

Suggested entitlement error:

```text
This ChatGPT account cannot use the selected model or capability. Choose
another model, check your ChatGPT plan/workspace, or use an OpenAI API
key provider.
```

## User Routing

User-facing routing should be narrow:

| User wants...                                            | Send them to...                                   |
| -------------------------------------------------------- | ------------------------------------------------- |
| Start a new unconfigured Desktop profile                 | ChatGPT Subscription, then explicit alternatives  |
| Use managed Grida AI without ChatGPT sign-in             | First-party gateway                               |
| Use an OpenAI API billing account                        | OpenAI API-key/BYOK provider                      |
| Use an eligible ChatGPT plan without creating an API key | ChatGPT Subscription provider                     |
| Run Codex itself, with Codex tools/sandbox/session       | Codex ACP provider                                |
| Generate images through OpenAI API billing               | OpenAI API-key/BYOK or first-party media provider |

The user should never be asked to paste ChatGPT browser cookies, private
access tokens, or copied local Codex auth files into the host app.

## Non-Interactive Access

The normal user flow is browser sign-in. Non-interactive access is a
separate enterprise or automation concern.

OpenAI documents Codex access tokens for trusted workflows that need
ChatGPT workspace access without a browser sign-in; API-key auth remains
the default recommendation for general automation. See
[Codex access tokens](https://developers.openai.com/codex/enterprise/access-tokens).

For the native provider:

- the host SHOULD NOT ask ordinary users to create or paste access tokens;
- enterprise access-token support SHOULD be a separate admin or advanced
  path;
- the host MUST still keep access-token material in the secret store;
- an access token MUST be treated as a ChatGPT/Codex credential, not as
  an OpenAI API key;
- if a workflow only needs API billing, the user should use the OpenAI
  API-key/BYOK provider instead.

## Media Boundary

Image input support is not image generation.

The provider MUST advertise media generation only when the ChatGPT
subscription credential has a direct, documented, host-callable
generation surface.

| Capability             | Allowed claim                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Image input            | The selected model can read images in prompts.                                           |
| Image generation       | The host can directly request a generated image artifact from this provider.             |
| Video/audio generation | The host can directly request generated video/audio from this provider.                  |
| Agent-mediated media   | Codex ACP may create media through its own agent tools, outside native provider control. |

The provider MUST NOT infer image generation from:

- image input support;
- a multimodal OpenAI model;
- ChatGPT product features;
- Codex ACP's possible tools;
- Codex CLI's possible tools;
- the public OpenAI Images API.

If direct media generation is required and the ChatGPT subscription
surface does not expose it, use a first-party gateway or an OpenAI
API-key/BYOK media provider. If media generation happens through Codex
ACP, the host may render or import the artifact, but Codex owns the
generation.

## ACP Boundary

Codex ACP is a separate agent-provider path.

The host MUST NOT:

- auto-install or auto-select Codex ACP when ChatGPT Subscription sign-in
  succeeds;
- reuse ChatGPT Subscription credentials for Codex ACP unless Codex
  explicitly supports that handoff;
- show Codex ACP models inside the native model picker as if they were
  host-owned models;
- imply that signing out of one surface signs out of the other unless the
  implementation actually shares credential custody.

The host MAY place a link or callout near ChatGPT Subscription:

```text
Want Codex itself to run the session with its own tools and sandbox? Use
Codex under ACP instead.
```

That callout should be secondary. It should not make ACP the default path
for users who only want a native model provider.

## Provider Selection

Provider selection is durable session intent, not a model-name side effect:

1. An explicit request/session provider wins.
2. An explicitly changed model is an intentional re-resolution request and
   may select another compatible provider.
3. Otherwise, a persisted user or session provider remains sticky when the
   model is omitted or unchanged.
4. A fresh, unconfigured session uses a ready ChatGPT Subscription connection
   first.
5. If ChatGPT is not ready, resolution preserves the existing native fallback:
   text BYOK, then Grida Gateway, then configured endpoint/local capacity.
6. The chosen provider carries through recovery, titling, and compaction.
   Continuations and queued turns reuse the selected model; auxiliary titling
   and compaction may use that provider's lower-cost model tier.

The model picker MUST expose provider and model as one explicit selection. When
the ChatGPT provider is ready, its closed compatible model set appears before
other native model choices, and an untouched new Desktop conversation starts on
the highest-capability compatible model (`GPT-5.6 Sol`). This default is derived
from live readiness and MUST NOT be persisted as a global preference. The
provider group order is ChatGPT Subscription when ready, Grida, configured text
BYOK providers, then configured compatible endpoints. The Grida, OpenRouter,
and Vercel groups may repeat catalog model ids because each tuple names a
different cost and privacy boundary. OpenAI-shaped model ids outside the closed
ChatGPT set never gain ChatGPT eligibility from their name alone.

An auth, entitlement, rate, or quota failure MUST leave the failed turn on its
selected provider. The app MAY offer another available provider before a new
turn, but the user must explicitly accept any cost, privacy, and capability
change. There is no silent mid-turn failover.

## Desktop Security Boundary

The Desktop authorization ceremony is registered as
**`GRIDA-SEC-008: ChatGPT subscription OAuth credential boundary`**. The
callback, bridge, credential manager, exact provider transport, cancellation,
sign-out, and negative-test enforcement form one active boundary. See
[Desktop agent security](../../desktop/agent-security.md) and the canonical
[security registry](https://github.com/gridaco/grida/blob/main/SECURITY.md).

SEC-008 records the implementation's actual trust posture: exact
authorization/token/Responses destinations; a fixed public native client
identity with a host override; one-time state and PKCE S256; renderer-safe
status only; owner-readable credential persistence; and no credential import.
It does not claim nonce binding or independent JWT signature/JWKS validation.
Claims are trusted only because they come in the bounded response from the
exact TLS-authenticated token endpoint. The active local boundary does not
remove the external stable/legal/support release gate with OpenAI.

## Conformance

A conforming implementation satisfies all of the following:

- The provider id is distinct from `openai`, `gg`, and `codex-acp`.
- Experimental sign-in uses the exact pinned OpenAI/ChatGPT native flow and is
  not described as a supported Grida integration before the external gate.
- Token material is stored only in a secret store.
- Sign-out clears local credential material.
- The model/capability list is ChatGPT/Codex-surface-specific.
- Auth failures and entitlement failures have different user copy.
- OpenAI API-key setup remains separate.
- Codex ACP setup remains separate.
- Image input and image generation are represented separately.
- A persisted provider remains sticky while its model is omitted or unchanged;
  an explicit provider or explicitly changed model is an intentional switch.
- A new, unconfigured Desktop user sees ChatGPT sign-in first, and a ready
  connection becomes the first session provider.
- A ready ChatGPT connection appears first in the native text-model picker, and
  each of its choices records the `chatgpt` provider with an eligible model.
- An untouched new conversation defaults to `GPT-5.6 Sol` while ChatGPT is
  ready, without storing a global preference.
- The picker always exposes Grida-hosted models under **Grida** and identifies
  configured BYOK and endpoint choices by provider.
- The picker never infers ChatGPT provider ownership from an `openai/*` model
  id.
- Without a ready ChatGPT connection, text resolution remains BYOK, then GG,
  then configured endpoints.
- Provider failure never causes a silent mid-turn fallback.
- The active SEC-008 boundary describes the implemented callback, credential,
  bridge, and provider-transport controls without overstating claim
  verification or OpenAI support.
- Native turns remain in the host's normal session, stream, inspection,
  and tool-policy model.

## References

- [Codex Authentication](https://developers.openai.com/codex/auth) —
  ChatGPT sign-in, API-key sign-in, access tokens, login caching, and
  policy differences.
- [Codex Pricing](https://developers.openai.com/codex/pricing) — which
  ChatGPT plans include Codex and how API-key usage differs.
- [Codex Models](https://developers.openai.com/codex/models) — Codex
  model recommendations and availability.
- [Codex CLI reference](https://developers.openai.com/codex/cli/reference)
  — documented login modes for local Codex workflows.
- [Codex access tokens](https://developers.openai.com/codex/enterprise/access-tokens)
  — non-interactive ChatGPT workspace credentials for trusted Codex
  workflows.
- [Responses API create](https://developers.openai.com/api/reference/resources/responses/methods/create/)
  — public API request surface for text/image-input model responses.
- [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation)
  and
  [image generation tool](https://developers.openai.com/api/docs/guides/tools-image-generation)
  — public API media-generation surfaces.
- [Zed: ChatGPT subscription in Zed](https://zed.dev/blog/chatgpt-subscription-in-zed)
  — behavioral interoperability evidence, not an authorization or source-code
  dependency.
- [ACP Provider: Codex](./acp-provider-codex.md) — separate provider
  profile for consuming Codex as an external agent.
- [ACP Integration](./acp.md) — the outward ACP protocol boundary.
