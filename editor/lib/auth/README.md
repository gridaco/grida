# Native OAuth deployment configuration

The [client authentication blueprint](https://grida.co/docs/reference/authentication)
maps web, Desktop, CLI and provider authority. This document owns the concrete
web-server configuration for native OAuth; avoid duplicating its variable table.

For operators deploying Grida's browser consent and native account API. The
configuration reader is [oauth-server.ts](oauth-server.ts); consent proofs belong
to [oauth-consent.ts](oauth-consent.ts). Keep this reference and deployment notes
aligned when either contract changes.

## Environment variables

Set these on the **web server**, not in GitHub Actions or the installed CLI.
For Grida's hosted service, use Vercel's `grida` project → Settings → Environment
Variables → **Production**. Save a description with each variable identifying
its purpose below and linking to this document. A new production deployment is
required after adding or changing values; an existing deployment retains its
configuration.

| Variable                     | Shape                                                            | Purpose                                                                                                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GRIDA_OAUTH_ISSUER`         | Exact canonical HTTPS Auth issuer ending in `/auth/v1`           | Pins token issuer comparison and Auth requests. Use `issuer` from the [public registration](../../../packages/grida-cli/src/oauth-client-registration.ts). A Data API load balancer or read-replica alias is not this identity.                                        |
| `GRIDA_OAUTH_CLIENT_IDS`     | Comma-separated UUIDs; nonempty                                  | Allows registered native clients at consent and the account API. For the shipped CLI, use `clientId` from the [public registration](../../../packages/grida-cli/src/oauth-client-registration.ts).                                                                     |
| `GRIDA_OAUTH_ORIGIN`         | One HTTPS origin, without a path, query, fragment or credentials | Pins the browser consent Host/Origin and proof issuer. It must match the deployed consent page's origin and the Supabase OAuth authorization-path configuration.                                                                                                       |
| `GRIDA_OAUTH_REDIRECT_URIS`  | Comma-separated exact callback URLs; nonempty                    | Allows only the registered CLI callbacks. Use `redirectUris` from the same public registration; keep Supabase's app registration identical. Each URL must be canonical HTTP on `127.0.0.1`, with an explicit port at least 1024 and no query, fragment or credentials. |
| `GRIDA_OAUTH_CONSENT_SECRET` | Independent random server-only string, at least 32 UTF-8 bytes   | Signs ten-minute browser consent proofs. Store as a sensitive Vercel variable. It is not an OAuth client secret, Supabase key or GG signing key.                                                                                                                       |

The common reader also requires `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the same Supabase project. The URL
supplies the Data API origin; it may use that project's read-replica or load
balancer hostname. It does not select the OAuth issuer. Native organization,
credit and membership reads retain that data origin, while consent and live
identity verification use `GRIDA_OAUTH_ISSUER`. Never substitute a privileged
Supabase credential for the publishable key. The `GRIDA_OAUTH_*` variables must
not acquire a `NEXT_PUBLIC_` prefix.

Both destinations are trusted server configuration and must belong to the same
Supabase project. Do not derive the issuer by rewriting a replica hostname or
reading a JWT claim. Keep the canonical issuer explicit even when Auth and Data
API traffic currently use one hostname. Changing data routing must not change
which issuer is accepted, and changing auth configuration must not reroute data.

The client ID and callback addresses are public registration metadata. Keep
their concrete values in the linked CLI registration file instead of copying
another list here. Changing issuer, client ID or API origin also changes the
CLI's durable credential profile identity; already installed binaries retain
their shipped registration. Coordinate server allowlists, Supabase registration
and client releases before changing them.

## Production and local use

Supabase must have its OAuth server enabled and a public native client registered
with no client secret, authorization-code/refresh-token grants and the exact
callbacks. Its configured consent path must reach Grida's `/oauth/consent` page.
Web environment variables do not create that registration or apply a database
migration. Account APIs retain their [machine request policy](../api/README.md)
and [security contract](../../../SECURITY.md).

Production uses the shipped registration and production Supabase project. Do
not copy those settings or its consent secret into Preview or local development.
There is no separate hosted staging database. A Vercel Preview is not an isolated
auth environment merely because it has a different web URL.

For local auth development, use the [disposable OAuth fixture](../../../scripts/auth-local/README.md).
It creates its own client, local Supabase settings and independent consent/GG
secrets, and supplies an explicit local issuer to an isolated editor. The reader
permits HTTP origins only on `127.0.0.1` for this use. Restart the fixture editor after bootstrap
changes its settings. The blank entries in [the environment example](../../.env.example)
only make the required names discoverable; they do not enable native OAuth.

## Secret lifecycle

Generate a fresh value from at least 32 cryptographically random bytes, for
example with `openssl rand -hex 32` in a private operator session. Transfer it
directly into sensitive server configuration; never put the result in Git,
deployment descriptions, command arguments, screenshots or CI logs. Share the
same value across instances of the same active deployment.

Rotation replaces the value and requires a new deployment. There is no previous
consent-key slot: forms signed with the old key fail when submitted to the new
deployment. Users must restart login or reload consent. Proofs otherwise expire
after ten minutes. Rotation does not revoke existing Supabase account sessions,
refresh tokens or GG grants. Rolling back to an old deployment can restore its
old configuration; when retiring a compromised secret, redeploy compatible code
with the new secret instead of restoring the old deployment.

## Verify the deployed configuration

Missing or invalid common configuration fails closed: a native account request
returns JSON `503` with `error.code: "not_configured"`. Consent-only configuration
errors likewise prevent approval; the decision endpoint returns a safe error,
while the consent GET renders an error page and may still return HTTP `200`.
An HTML status alone is not a readiness check.

Configure `GRIDA_OAUTH_ISSUER` before deploying code that requires it. Confirm it
matches the installed CLI registration and the issuer in Supabase's public OAuth
discovery metadata. A reachable Data API alias is not evidence of a matching JWT
issuer; a mismatch rejects login before the live identity request.

A credential-free request to the canonical production origin is a useful first
check:

```sh
curl --include --max-time 15 https://grida.co/api/v1/auth/me
```

Expect JSON `401 unauthorized`, `Cache-Control: no-store`, a Bearer challenge,
and no redirect or session cookie. This checks routing and acceptance of the
common configuration without issuing an account credential. It does **not**
validate the consent-only settings, issuer reachability, client registration,
login, refresh, logout or credit access. Confirm those settings in the deployment
and finish with a real native login/account smoke test. Inspect hosted consent
responses for `no-store`, frame denial and origin-only referrers as required by
the security contract; never save tokens, consent proofs or authorization URLs
in verification logs.

Existing offline OAuth contracts run without dotenv files:

```sh
node_modules/.bin/vitest run --config editor/vitest.oauth.config.ts
```

They and the local fixture prove their respective contracts, not production
activation. [CLI release readiness](../../../scripts/cli-release/README.md)
requires deployed account access to be verified separately from green CI.
