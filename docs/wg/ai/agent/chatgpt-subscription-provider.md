---
title: ChatGPT Subscription Provider Implementation Guide
description: Implementation guide for using a user's eligible ChatGPT plan as a native OpenAI/Codex-backed model provider. Covers auth flow, credential custody, capability resolution, user flow, first-party gateway, OpenAI API-key/BYOK, Codex ACP, and media-generation boundaries.
keywords:
  [
    agent-system,
    implementation-guide,
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

# ChatGPT Subscription Provider Implementation Guide

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
3. User clicks **Sign in with ChatGPT**.
4. App opens the provider-approved browser sign-in flow.
5. User completes ChatGPT/OpenAI account login and workspace selection.
6. Browser returns to the app through the approved callback flow.
7. App stores the resulting credential in the OS credential store.
8. App resolves available models/capabilities for that signed-in account.
9. App marks the provider connected and allows it in the model picker.
10. User may sign out from the same provider settings panel.

The onboarding flow SHOULD NOT promote this provider as the first default
when a first-party gateway is available. It MAY offer ChatGPT
Subscription as an optional account-linking path for users who already
have an eligible ChatGPT plan and do not have an OpenAI API key.

## Auth Flow

The auth flow SHOULD be browser-based and PKCE-style:

```text
App
  |
  |-- create auth request
  |     - random state
  |     - PKCE verifier/challenge
  |     - provider-approved redirect URI
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
  |-- exchange authorization result through approved token flow
  |
  v
Credential store
  |
  |-- persist token material outside project files
  |-- record account/workspace display metadata
```

Implementation requirements:

| Step              | Requirement                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Browser launch    | The app SHOULD use the system browser, not an embedded password form.                                                                   |
| CSRF protection   | The app MUST bind the callback to a random state value.                                                                                 |
| PKCE              | The app SHOULD use PKCE for an installed-app flow.                                                                                      |
| Redirect handling | The redirect URI MUST be provider-approved; localhost and custom-scheme callbacks are both possible policy choices.                     |
| Token exchange    | The app MUST use only an approved OAuth/token flow. It MUST NOT scrape ChatGPT cookies or ask the user to paste private browser tokens. |
| Token custody     | Access/refresh material MUST live in an OS credential store or equivalent secret store, not in project settings.                        |
| Display metadata  | The app MAY store non-secret metadata such as email, account id, or workspace label for UI.                                             |
| Sign out          | Sign out MUST clear local credential material and provider connection state.                                                            |

If the implementation cannot obtain an approved ChatGPT/Codex token flow,
it MUST NOT expose this as a native provider. The fallback is a
first-party gateway, OpenAI API-key/BYOK, or Codex ACP.

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

Dynamic capability discovery is preferred. If the provider cannot fetch
capabilities dynamically, it MAY ship a conservative static list, but it
MUST treat upstream rejection as an entitlement/capability error rather
than an API-key error.

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
- SHOULD make the first-party gateway the default first-run native option
  when available;
- SHOULD make ChatGPT Subscription an optional account-linking provider;
- SHOULD show the signed-in ChatGPT account/workspace label;
- SHOULD show the selected model as `provider/model`, not as a global OpenAI API
  model;
- MUST give auth errors ChatGPT-specific copy;
- MUST give entitlement errors model/capability-specific copy;
- MUST provide an explicit sign-out control;
- MUST keep secrets in the platform secret store;
- MUST keep host-native turns inspectable in the normal agent transcript.

Suggested settings copy:

```text
Sign in with ChatGPT to use eligible OpenAI models through your ChatGPT
subscription. This does not configure an OpenAI API key or Codex ACP.
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
| Default first-party AI without setup                     | First-party gateway                               |
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

## Conformance

A conforming implementation satisfies all of the following:

- The provider id is distinct from `openai`, `gg`, and `codex-acp`.
- Sign-in uses an approved OpenAI/ChatGPT auth flow.
- Token material is stored only in a secret store.
- Sign-out clears local credential material.
- The model/capability list is ChatGPT/Codex-surface-specific.
- Auth failures and entitlement failures have different user copy.
- OpenAI API-key setup remains separate.
- Codex ACP setup remains separate.
- Image input and image generation are represented separately.
- The provider is optional in onboarding; the first-party gateway remains
  the first native default when available.
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
- [ACP Provider: Codex](./acp-provider-codex.md) — separate provider
  profile for consuming Codex as an external agent.
- [ACP Integration](./acp.md) — the outward ACP protocol boundary.
