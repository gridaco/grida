---
title: Client authentication blueprint
description: How Grida web, Desktop, CLI, and AI providers establish identity, hold credentials, and end sessions.
keywords: [grida, authentication, oauth, cli, desktop, supabase, credentials]
tags: [internal, reference, platform, infra, cli, architecture]
format: md
---

# Client authentication blueprint

Grida has one account authority, Supabase Auth, and several independent clients.
A shared account does not mean a shared credential store or identical logout
behavior. AI-provider credentials are a separate authority from Grida identity.

This is an architecture reference for contributors. It maps the current client
model and its security contracts; it is not certification of a particular
deployment or installed release. The [native account architecture](../wg/cli/account-infrastructure.md)
owns the CLI contract, and the [security registry](https://github.com/gridaco/grida/blob/main/SECURITY.md)
owns enforcement and its source/test inventory.

**GRIDA-SEC-015 — Account-to-media credential handoff** binds the composition
rule: adding a media consumer must not turn an account session into a provider
credential. The existing boundaries below retain their individual ownership.

## Clients and session owners

| Client or consumer         | How it authenticates                                                                                                                   | Where its credentials live                                                                               | What it calls                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Web browser                | Google sign-in or the supported email flow creates a Supabase session.                                                                 | The browser's Supabase SSR cookie store.                                                                 | Grida web routes and permitted Supabase client operations.                         |
| Desktop account            | System-browser sign-in binds a code to an Electron-held PKCE verifier; a fixed `grida://auth/callback` handoff completes the exchange. | Electron's Chromium default-session cookie jar, separate from the system browser.                        | Same-origin `/desktop/*` account, billing and GG-mint routes.                      |
| CLI account                | Registered public OAuth client; browser consent, authorization code and S256 PKCE, then a fixed loopback callback.                     | Its own Grida auth profile: OS keyring by default, explicitly selected private plaintext file otherwise. | Supabase OAuth lifecycle endpoints and fixed Grida `/api/v1` account/GG-mint APIs. |
| Desktop native media/agent | Receives a scoped GG grant, or uses a configured provider credential.                                                                  | GG in memory; provider credentials in their separate native stores.                                      | GG or the selected provider, through the native transport owner.                   |
| CLI media                  | Explicit provider selection chooses GG account exchange or BYOK.                                                                       | GG for one invocation in memory; BYOK through explicit input/environment or the shared provider store.   | GG or the selected provider; never needs Desktop running.                          |

Web and Desktop use SSR-compatible cookies. The current helpers do not configure
them as HttpOnly; the blueprint does not assume the trusted renderer cannot
access its own same-origin cookies. Electron main obtains an account projection
through fixed routes rather than exporting cookie/token material through the
bridge. Renderer trust, CSP, navigation admission and native IPC are separate
controls under GRIDA-SEC-004/005.

The [custody contract](../wg/cli/credential-custody.md) owns CLI platform support,
private-file rules and refresh coordination. Main and published binaries can
advance independently: shared BYOK support in source does not imply every older
Desktop installation has adopted that store.

## CLI login, use and logout

1. **Start locally.** The CLI binds a registered loopback listener and creates
   fresh state and PKCE material before opening the system browser.
2. **Authorize in the browser.** Supabase's authorization endpoint sends the
   browser to Grida consent when needed. Grida verifies the signed-in user and
   pending request before submitting the decision to Supabase.
3. **Exchange the code.** The browser delivers Supabase's one-use code through
   the registered loopback callback. The CLI checks that callback and exchanges
   the code with its PKCE verifier directly at Supabase.
4. **Verify and save.** The CLI calls Grida's identity API with the new bearer.
   Grida verifies it at the fixed OAuth userinfo endpoint. Only then does the CLI
   persist the verified session in its own profile.
5. **Use and renew.** Account, membership and credit commands call Grida's API.
   The CLI renews credentials directly at Supabase when an online operation
   needs them and saves accepted rotation under its custody rules.
6. **Sign out.** The CLI clears local custody and asks Supabase to revoke only
   the captured CLI session. It reports remote revocation as `confirmed`,
   `unconfirmed`, or `not-needed`, separately from local clearing.

Existing browser consent can skip the decision screen; it still authorizes a
separate native session. The browser callback receipt means a code arrived,
not that exchange, identity verification or persistence succeeded. Only the CLI's
completed result establishes those later steps.

The shipped registration fixes issuer, client ID, API origin and two callbacks:
`http://127.0.0.1:55435/callback` and `http://127.0.0.1:55436/callback`.
Those ports are registered addresses, not secrets. The client binds one before
browser launch and fails if neither is available. State, PKCE and strict callback
admission provide the protection; a local port number does not.

An online account operation refreshes near expiry as needed. `auth status` only
reads local metadata. Refresh rotation and custody writes are coordinated across
CLI processes; an accepted rotation must not be replaced with an old refresh
token after a later request fails. Ordinary account reads never start login.

## Which credential means what

| Credential                         | Authority                                                                                                                                      | It does not establish                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| OAuth public client ID             | Identifies a registered application and its callbacks.                                                                                         | A trustworthy binary, a user identity, or a client secret.                 |
| Supabase publishable key           | Public project/API admission where the endpoint requires it. Safe to distribute in a client.                                                   | User identity, organization membership, or RLS bypass.                     |
| Supabase account access token      | A user's session and existing authorized access. Native APIs additionally require the configured issuer/client and live identity verification. | A GG or external-provider credential.                                      |
| Supabase refresh token             | Renewal of its account session at the issuer.                                                                                                  | Direct access to Grida account or generation APIs.                         |
| GG grant                           | Short-lived, one-organization `gg:ai` access, signed with GG's separate authority.                                                             | Account identity, account refresh, or direct access to upstream providers. |
| Provider API key (BYOK)            | Whatever the selected external provider permits for that key.                                                                                  | Grida login or Grida credit eligibility.                                   |
| ChatGPT subscription OAuth         | The separate experimental text-provider connection in the full native agent.                                                                   | Grida login, shared CLI account custody, or an installed Codex session.    |
| Native daemon transport credential | Access to its admitted local daemon capabilities.                                                                                              | A Grida account session or provider entitlement.                           |

The account-to-media boundary is enforced in both directions: native account
APIs reject GG credentials; GG verifies its dedicated signing key, HS256 algorithm,
`gg:ai` audience, organization and bounded lifetime.
The CLI's GG branch receives only a scoped grant through the auth owner's narrow
memory handoff. Its BYOK branch does not open account custody, and failure does
not silently switch to GG. These are GRIDA-SEC-015's composition rules; token
cryptography and egress remain GRIDA-SEC-006/010/013.

Desktop selects provider access through its own application policy. Its renderer
exchanges account cookies for GG at `/desktop/auth/token` and supplies only that
grant to the native media/agent consumer. The CLI uses `/api/v1/auth/gg`; both
mint paths share membership and GG policy. GG grants are memory-only and normally
last fifteen minutes, with the verifier's documented clock tolerance.

Native BYOK uses a shared private TOML store on supported macOS/Linux clients.
Changing that provider entry affects both clients that use it; Grida account
logout does not remove it. ChatGPT OAuth has a separate native `auth.json`
credential lifecycle, not the CLI keyring. Media-only Desktop startup does not
mount that text-provider OAuth manager. See [Desktop's provider contract](https://github.com/gridaco/grida/blob/main/desktop/docs/chatgpt-subscription-oauth.md)
and GRIDA-SEC-008/014 for support and custody limits.

Server-only credentials stay out of these clients: Supabase secret/service-role
authority, GG's signing key, and the consent-proof HMAC secret have different
owners and purposes. The existing fixed server-to-server hook credential is
another separate lane, not a general CLI authentication mechanism.

## Account data remains server-authorized

The supported CLI calls Grida's wrapped account APIs. Native bearer verification
checks issuer, expiry, client and session claims, then verifies live userinfo;
decoded claims alone do not establish identity. Account and credit reads retain
the user's bearer and project publishable key for database RLS, while GG minting
checks current organization membership before issuing a grant.

The command surface is not a security sandbox around the token. A custom client
can send a Supabase bearer directly to accessible Supabase APIs. Grants, RLS,
membership checks and each endpoint's credential contract must enforce access
regardless of which executable sent the request. Identity scopes are not a
read-only permission model. Legacy browser/bearer endpoints do not acquire the
native API's stronger client allowlist merely because the CLI exists.

## Logout has an explicit scope

| Action                           | Local effect                                                                                                | Requested server effect                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| CLI `auth logout`                | Clear only its own account profile, including stale-write fencing.                                          | `scope=local`: revoke that CLI session. Report remote failure independently of local clearing. |
| Current web sign-out             | On successful SDK sign-out, clear the initiating browser's auth state.                                      | Account-wide sign-out through the SDK's default `global` scope.                                |
| Current Desktop account sign-out | Clear Desktop's hosted GG capacity and transition its native entry window after the account route succeeds. | Account-wide sign-out through the SDK's default `global` scope.                                |
| Provider disconnect / remove     | Change that provider's own credential store.                                                                | Provider-specific behavior; not Grida account logout.                                          |

Isolation is directional: CLI session-local logout must preserve other sessions;
current web/Desktop sign-out requests broader revocation. Independent cookie and
keyring stores do not override server-side scope. Changing that policy requires
an explicit client behavior decision and compatibility tests.

Local clearing, a successful HTTP response, and verified server revocation are
different observations. `unconfirmed` must not be presented as completed remote
revocation. A later login cannot repair or prove an earlier session's revocation.
Application-grant revocation and account-wide sign-out are not fallbacks for a
failed session-local request.

Supabase revocation stops affected refresh tokens; already-issued access JWTs
can retain their remaining lifetime. Grida's native account and GG-mint APIs
add live userinfo verification, so revoked sessions are rejected on new requests
even before JWT expiry. An already-issued GG grant retains its own bounded
lifetime, and logout cannot recall work already accepted by a server.
See [Supabase sign-out semantics](https://supabase.com/docs/guides/auth/signout).

## Configuration and change ownership

| Concern                                      | Canonical owner                                                                                                           | Change consequence                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI issuer, client ID, API origin, callbacks | [Public CLI registration](https://github.com/gridaco/grida/blob/main/packages/grida-cli/src/oauth-client-registration.ts) | Bundled into installed binaries; coordinate registration, allowlists and client releases. Issuer/client/API also bind durable profiles.     |
| Native bearer acceptance and consent         | [Web auth configuration](https://github.com/gridaco/grida/blob/main/editor/lib/auth/README.md)                            | Web deployment plus matching Supabase OAuth registration. Consent signing authority stays server-only.                                      |
| Auth issuer versus Data API origin           | Same web configuration                                                                                                    | The canonical issuer is independent of a same-project Data API replica/load-balancer URL. Never infer one by rewriting the other.           |
| API gateway admission                        | Endpoint contract plus public application configuration                                                                   | Public project keys and user tokens are distinct. OAuth token exchange and ordinary Auth endpoints can have different gateway requirements. |
| Native account lifecycle and persistence     | [`@grida/auth`](https://github.com/gridaco/grida/blob/main/packages/grida-auth/README.md)                                 | Shared lifecycle/host changes need package and installed-client tests.                                                                      |
| Desktop cookie ceremony and native entry     | [Desktop](https://github.com/gridaco/grida/blob/main/desktop/README.md), GRIDA-SEC-005                                    | Distinguish hosted renderer changes from native payload releases.                                                                           |
| Organization, billing and GG authority       | Account APIs, RLS and GG policy                                                                                           | Client configuration cannot grant membership or replace server checks.                                                                      |

The environment topology is production and disposable local Supabase. A Vercel
Preview deployment is not an isolated auth/database environment. Local fixtures
must use their own project, registration, secrets and credential home.

## Verification and maintenance

Each change names its credential owner, destination, accepted credential family,
logout scope and release surface. Review callback admission, refresh rotation,
local clearing, remote revocation, concurrency and failure reporting together.
Keep this reference and the owning SEC entry aligned when any of those change.

Unit tests prove owner contracts. A disposable real issuer proves exchange,
refresh-token invalidation and preservation of other sessions. Gateway-shaped
tests must also cover hosted admission and successful empty response bodies.
An installed-client hosted check then proves the deployed routing/configuration
and real user experience; neither green CI nor an unauthenticated HTTP response
substitutes for it. Record deployment-specific evidence privately and never put
tokens, authorization URLs, callbacks containing codes/state, operator data or
implementation TODOs in this blueprint. Registered callback addresses are public.

The boundary map is GRIDA-SEC-004 (native perimeter), 005 (Desktop ceremony),
006 (GG), 008 (ChatGPT provider), 010 (native account), 011 (local fixture),
012 (machine API routing), 013 (CLI media egress), 014 (BYOK custody), and
015 (account-to-media composition). Consult the
[registry](https://github.com/gridaco/grida/blob/main/SECURITY.md) for the exact
enforcement files and tests.
