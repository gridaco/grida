# ChatGPT subscription OAuth binding

This document binds the native ChatGPT model-provider contract to Grida
Desktop. Grida owns the model loop, sessions, tools, and approvals in its Rust
executable, which Desktop controls over private ACP stdio. ChatGPT supplies
model inference.

The implementation is experimental because OpenAI client registration and
the stable legal/support contract are external release gates. Desktop keeps
the identity in one host-owned configuration module so a future host-owned
registration can replace the current public native-client identity without
changing provider, callback, or renderer code.

> **GRIDA-SEC-008 — ChatGPT subscription OAuth credential boundary.** The
> callback, guarded bridge, credential manager, and exact provider
> destinations are one active local security boundary. “Active” does not mean
> OpenAI has approved or supports the experimental integration.

## Fixed identity and destinations

`desktop/src/chatgpt-configuration.ts` owns the complete Desktop binding:

- authorization: `https://auth.openai.com/oauth/authorize`;
- token exchange/refresh: `https://auth.openai.com/oauth/token`;
- inference: `https://chatgpt.com/backend-api/codex/responses`;
- callbacks: `http://localhost:1455/auth/callback`, then port `1457`;
- scopes: `openid profile email offline_access`;
- product originator: `grida`;
- public Codex native OAuth client id
  `app_EMoamEEZ73f0CkXaXp7hrann`, replaceable with
  `GRIDA_CHATGPT_OAUTH_CLIENT_ID`;
- the default and tier choices from the agent package's closed subscription
  model set.

The client id is public native-app identity, not a secret. Desktop accepts no
client secret. It must not be described as Grida-owned or OpenAI-approved.

The authorization query also pins
`id_token_add_organizations=true`,
`codex_cli_simplified_flow=true`, and `originator=grida`. Inference sends
`originator: grida`.

The current closed model compatibility projection consists of
`openai/gpt-5.6-sol`, `openai/gpt-5.6-terra`,
`openai/gpt-5.6-luna`, `openai/gpt-5.5`, and `openai/gpt-5.4`. It mirrors the
observed Zed/Codex-compatible surface, not authenticated discovery; it may
drift, and an account can refuse a listed model.

A Main-only provider network grant admits exact `auth.openai.com` and
`chatgpt.com` HTTPS origins only on the credential-bearing provider lane. It is
never published to the retained media sidecar. Neither origin joins the
credential-free asset-download lane, and lookalike subdomains are refused.

## Ceremony

1. A `/desktop/*` renderer invokes guarded `CHATGPT_CONNECT` IPC with no URL,
   redirect, code, or provider parameters.
2. Electron main binds the configured callback port on both `127.0.0.1` and
   `::1` when available. It emits the registered `http://localhost` URI.
3. Main passes that URI to the credential owner's `start` call.
4. The owner generates state plus PKCE verifier/challenge, retains the
   verifier in one launch-scoped attempt, and returns the authorization URL.
5. Main reconstructs and validates the fixed authorization authority,
   pathname, client id, redirect URI, response type, state, and S256 challenge
   before calling Electron's `shell.openExternal`.
6. The temporary callback accepts one bounded GET on the exact path and Host.
   It compares state in constant time. An invalid state does not consume the
   listener; a valid callback is atomically claimed, closing both listeners to
   replays.
7. Main forwards the code, state, and attempt id directly to the owner's
   `complete` call. A callback already aborted does not reach the owner.
8. The owner exchanges the code through the host-routed provider transport
   and durably stores the refreshable credential.
9. Only after completion returns a ready, secret-free account status does the
   callback render its success page and the IPC invocation resolve.

The callback and credential attempt share a ten-minute lifetime so normal browser
login and MFA remain possible. Every timeout, cancellation, completion error,
main shutdown, and successful terminal response closes the listeners.

The profile sends state and PKCE S256, but no OIDC nonce. The credential owner does not
independently verify JWT signature, JWKS, issuer, or audience. It parses
bounded account/display claims only from the response returned by the exact
TLS-authenticated token endpoint. Trust therefore comes from the pinned token
endpoint and platform TLS trust path, not a second JWT-verification layer.

## Renderer surface

`window.grida.chatgpt` is optional on the protocol-1 bridge and exposes only:

- `connect()`;
- `cancel()`;
- `status()`;
- `sign_out()`.

Every result is `ChatGptSubscriptionStatus`: booleans, optional expiry, and
bounded account display fields. Main explicitly reconstructs that DTO rather
than forwarding the owner's result object, so a future accidental token field
cannot cross the bridge. Owner failures reach the renderer only as a safe
error code.

There is no renderer route for OAuth start/complete and no bridge method that
accepts an authorization URL, code, state, verifier, token, or redirect URI.
All four IPC handlers use the existing exact editor-origin plus `/desktop/*`
sender guard.

## Cancellation and sign-out

The coordinator records cancellation even while the callback is still
binding, so an early Cancel click cannot be lost. Once the owner has returned
an attempt id, cancellation closes the callback and invalidates that exact
attempt.

The credential manager also binds in-flight exchange persistence to the
attempt generation. Cancelling after the valid callback was claimed but before
the token response is stored must leave the account signed out. Sign-out
invalidates pending exchange/refresh generations before removing the durable
record, so a late network completion cannot resurrect it.

Application shutdown closes the callback and cancels its exact attempt. The
native subscription profile also drains its workspace processes and accepted
credential work within a bounded wait. Subscription sign-out withdraws those
workspaces before another can open. Grida account sign-out preserves the
separate subscription record.

## Storage and process boundary

The credential owner uses the daemon's `AuthStore` and its owner-only
`auth.json` file. It runs in-process in Electron main and exposes the ceremony
as direct start, complete, cancel, status and sign-out calls with bounded
inputs; there is no HTTP route. The renderer, the retained sidecar and the
Rust executable receive no OAuth tokens. The native model request passes through the private
provider broker, which injects credentials on the exact route.

The disposable profile defaults to Gateway. Select ChatGPT explicitly with
`--native-chat-provider=chatgpt` alongside `--native-chat` on a supported
development or Insiders profile. The experimental account and service
availability constraints also apply to this launch.

The implementation never reads `~/.codex/auth.json` or another application's
credential store.

## Verification

The focused offline contract covers:

- preferred/fallback ports and IPv4/IPv6 localhost behavior;
- invalid-state non-consumption, atomic claim, and replay refusal;
- bounded request parsing and non-reflective error pages;
- persistence-before-success, timeout, cancellation, and listener cleanup;
- authorization-URL authority/client/redirect/PKCE validation;
- renderer status reconstruction that drops unknown secret-looking fields;
- cancellation before bind, while the browser is open, and during token
  persistence;
- token-claim parsing only after the exact token endpoint response, without
  claiming nonce/JWT signature/JWKS verification;
- exact provider-lane network grants, held Main-only and never published to
  the sidecar, with no asset-lane grant.

A live-account smoke remains manual because it opens the system browser,
requires the user's ChatGPT account, and may consume plan quota.

### Executed live smoke

On 2026-07-28, the macOS development build of Desktop `0.0.14` completed the
manual flow against a ChatGPT Pro account:

- the real first-run onboarding step and Settings card rendered the
  experimental native-provider copy and kept Grida sign-in and ACP distinct;
- the signed-out status changed to `signing_in`, exposed Cancel, and opened the
  system browser on `https://auth.openai.com`;
- after OpenAI MFA, the localhost callback completed and the renderer received
  only a ready, secret-free account/status projection;
- one Grida-owned agent turn ran with provider `chatgpt`, model
  `openai/gpt-5.6-terra`, and returned the requested text without an error;
- an Electron relaunch restored the ready connection from persisted custody;
- callback ports `1455` and `1457` were closed after completion, and the
  temporary verification session was deleted.

This is evidence that the current compatibility profile works; it does not
remove the external OpenAI support, registration, terms, or static-model-list
release gates.
