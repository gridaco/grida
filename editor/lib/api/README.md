# Machine API boundary

> **GRIDA-SEC-012** — see [SECURITY.md](../../../SECURITY.md).

For contributors adding or maintaining `/api/v1` endpoints in the Next.js app.
This namespace has its own request policy. The legacy `/v1`, browser/private,
Desktop, consent, and webhook surfaces retain their existing contracts.

## Owners

- `operations.ts` declares every path, supported method, credential family and binding.
- `policy.ts` admits only configured API hosts and registered paths before any
  browser dependency loads. Admission grants no identity. Unknown/encoded/cased
  paths return JSON 404; API maintenance returns JSON 503.
- `native.ts` owns live OAuth authentication, fixed method dispatch, safe errors
  and `no-store` for native account bindings. `account.ts` and `gg.ts` contribute
  their fixed input parsers and domain operations. Routes only export the
  declared handlers; they cannot provide an alternative authenticator.
- [Account projections](../account/account.ts) own organization pages;
  [the database adapter](../supabase/account-data.ts) supplies fixed queries with
  the same verified bearer and publishable key. It imports no cookie client and
  uses no privileged credential.
- [Shared native REST transport](../supabase/native-data.ts) owns bounded
  public-schema reads, exact-count validation and credential destinations.
  Account, credit and GG data adapters supply their fixed queries.
- [GG token owner](../gg/README.md) owns the shared mint policy. Its core receives
  clock, key and quota capabilities; the server binding has one configuration
  reader. Native and Desktop adapters retain their own authentication and
  organization-selection rules.

## Account reads

`GET /api/v1/auth/me` returns the verified caller's identity.
`GET /api/v1/account/organizations` returns the caller's RLS-visible organizations:

```json
{
  "organizations": [{ "id": 1, "name": "example", "display_name": "Example" }],
  "next_cursor": null
}
```

Organization pages contain at most 100 records ordered by increasing ID. Follow
a non-null cursor with `?after=<next_cursor>`; null means complete. Cursors must
be canonical positive safe integers. An empty `display_name` is preserved.
There is no user/org selector, page-size option, active-organization cookie,
membership role projection, or billing/provider information in this operation.

The database query selects only these fields from `public.organization`; its
membership RLS is the authority. Exact RLS-visible counts detect further pages
even when PostgREST's configured row limit is lower. Missing/inconsistent counts
and malformed data fail safely. A zero-membership page succeeds; issuer/database
failures never become an empty result. Each page reads current memberships;
pagination is not a transaction snapshot across requests. A cursor grants no access.

`GET /api/v1/account/credits?organization_id=1` reads the selected organization's
cached AI credits. The ID is required and must be a canonical positive safe
integer. The same verified bearer queries `public.v_billing_credits`, a
`security_invoker` view anchored on current membership; unknown and invisible
organizations both return 403. An earlier organization selection grants no access.

The response identifies the organization and contains `account_present`,
`state` (`not_provisioned`, `uncached`, or `cached`), `source: "cache"`,
`currency: "USD"`, nullable `balance_cents` and `cache_updated_at`, and
`billing_gate: {allowed, reason}`. No linked customer or no cache observation means
an unknown balance; recorded zero and negative estimates are preserved. Cache
timestamps include optimistic usage deductions. Gate eligibility follows the
existing billing policy and does not promise GG/provider readiness.

[The passive credits owner](../billing/credits.ts) contains the shared pure gate
and projection; [its query adapter](../supabase/credits-data.ts) imports no
cookie client, privileged client or provider SDK. The read performs no provider
refresh, provisioning or writes. Missing schema, invalid rows and DB failures
remain errors; they never become zero credits. Subscription billing is outside
this operation. Account identity and organization listing need no billing setup.

All account reads support authenticated HEAD and bodyless OPTIONS;
other methods return 405. Input and output share the existing no-store policy.
Credits OPTIONS accepts the bare route; any supplied query still must be valid.

Domain operations belong in their own modules and receive explicit authority
and inputs. They do not import Next, cookies or UI. HTTP adapters do not acquire
browser organization preferences or duplicate billing policy.

## Native GG access

`POST /api/v1/auth/gg` exchanges a live native OAuth bearer for one scoped
Grida Gateway token. Its JSON input is exactly one explicit organization ID:

```json
{ "organization_id": 1 }
```

The ID must be a positive safe integer written as a canonical decimal integer.
Query parameters, duplicate/extra/escaped field names, unsupported media or
content encodings, malformed UTF-8 and inconsistent length declarations are
rejected. The parser accepts at most 1024 bytes and waits at most one second
after route entry. Bodyless OPTIONS advertises POST/OPTIONS without contacting
the issuer; all other methods, including GET/HEAD, return 405.

After live bearer verification, [the member query](../supabase/gg-data.ts) uses
that exact credential and the configured publishable key. It filters the
verified user and explicit organization together, requires an exact zero/one-row
result, and returns no organization preference. Unknown or invisible membership
is 403. The shared mint policy checks the existing per-user quota before this
lookup and signs only after it succeeds. Rate limitation is 429; unavailable
signing setup or upstream failures are safe 503 responses. All responses are
`no-store`; cookies and organization headers supply no authority.

The response is `{token, expires_at, organization: {id, name}}`. Its dedicated
HS256 credential has audience `gg:ai` and a 900-second signed lifetime with the
existing 60-second verification tolerance. Minting checks no credits and performs
no billing/provider work. The account token can mint but cannot call
`/api/v1/ai/*`; a GG token can call that gateway but cannot read account data or
mint another grant. The static model list establishes access, not spending
eligibility. Desktop keeps its existing `/desktop/auth/token` response and
session-organization fallback over the same mint owner.

The native auth package's [scoped GG contract](../../../packages/grida-auth/README.md)
delivers the token only to a construction-time trusted synchronous memory sink.
Its public result contains organization/expiry metadata. This is a one-shot
handoff: logout before acceptance prevents delivery; later logout or sink failure
cannot recall a token already retained. Reusable GG custody and paid execution
need their own lifecycle contract.

## Adding a route

1. Implement the domain operation and its authorization tests.
2. Add its declaration and implementation to the credential-specific adapter.
3. Add a thin route binding, with explicit method exports, using
   [the identity route](<../../app/(api)/(public)/api/v1/auth/me/route.ts>) as the pattern.
4. Run the checks below and add real HTTP coverage for new boundary behavior.

The source audit rejects unregistered routes, standalone native handlers,
miswired exports, dependency leaks and unowned environment reads. It resolves
relative imports, aliases and re-exports transitively. Tests include invalid
source trees to prove these checks fail. This is a development check, not a
sandbox against malicious repository code.

Six existing GG/catalogue routes are explicitly pinned legacy bindings. Their
authentication, streaming, error formats and caching remain owned by those
handlers. A new route cannot opt into that exception. Account OAuth bearers and
GG's `gg:ai` tokens remain different credential families.

## Configuration

Native account access also requires the server-owned
[OAuth deployment configuration](../auth/README.md): issuer, registered client
allowlist and the separate browser consent settings. Configure and verify the
deployed web server before releasing a CLI that depends on it.

`GRIDA_API_ORIGIN` sets one exact canonical origin, without a trailing slash,
path or credentials. HTTPS is required except for explicit HTTP loopback origins.
Set it for a custom self-hosted address or local fixture; forwarded headers never
expand the allowlist. Invalid configuration returns a safe 503.

Without an override, allowed hosts are `NEXT_PUBLIC_URL` (hostname) or `grida.co`,
plus `VERCEL_URL`/`VERCEL_BRANCH_URL` on Vercel. Non-hosted development additionally
allows `localhost`/`127.0.0.1` at `PORT` (default 3000). Production-mode local
proofs must explicitly supply their loopback origin.

`GRIDA_API_MAINTENANCE=1` stops registered API operations with JSON 503.
Unset, empty or `0` serves normally; other values fail closed. This switch is
separate from the web maintenance page. Neither setting logs or echoes configuration.

The GG server's configuration owner reads `GG_TOKEN_SECRET` (at least 32 UTF-8
bytes after trimming) and optional `GG_TOKEN_SECRET_PREVIOUS` for verify-only
rotation. A current key is always required. Both mint adapters share the
`rl:v1-ai:mint` quota: 10 requests per user per 60 seconds using the configured
Upstash REST URL/token. The existing unconfigured-limiter allowance is preserved;
configured upstream failures, including the SDK's five-second timeout allowance,
return 503 without minting. Native uses `auth_unavailable`; Desktop uses
`mint_failed`. Actual quota exhaustion remains 429. The timeout bounds the quota
decision but does not cancel Redis work or trigger a remint. Signing and limiter
configuration never comes from request input.

Next configuration runs before proxy. Its web slash/connect redirects explicitly
exclude the API namespace and percent-encoded aliases. Account headers are set by
the adapter, never inherited from the legacy `/v1` CORS configuration.
Next still normalizes malformed repeated slashes/backslashes before proxy;
those framework redirects are outside the machine response contract.
Next.js 16.2.6 also clones POST bodies for the Node proxy and waits for the
original stream to end before entering the route. The mint parser's 1024-byte
limit and one-second deadline start after that step. They do not bound network
upload time. On managed Vercel, pre-route ingress relies on the platform's
[request-size limits](https://vercel.com/docs/routing-middleware#limits-on-requests)
and [slow-client protections](https://vercel.com/blog/life-of-a-vercel-request-what-happens-when-a-user-presses-enter),
as does the rest of this application. The documented Routing Middleware ceiling
is 4 MB; the separate [Function payload ceiling](https://vercel.com/docs/functions/limitations#request-body-size)
is 4.5 MB. This application promises no particular network upload deadline.
Record the deployment's host/runtime and verify its routing and authentication
behavior; local parser tests do not certify hosting infrastructure. Self-hosted
deployments must provide ingress size and slow-client controls. See the limits
and trust assumptions in GRIDA-SEC-012 in [SECURITY.md](../../../SECURITY.md).

## Check locally

After installing dependencies, each command builds the model catalogue it needs:

```sh
pnpm --filter editor test:api
pnpm --filter editor test:api:http
```

`test:api` audits real source and runs offline contracts without loading
dotenv files. `test:api:http` builds a minimal production-mode Next snapshot with the
real proxy, configuration, native account/GG bindings, signer and model list,
an owned synthetic issuer,
and recording replacements for unrelated web services. See the
[HTTP proof guide](../../../scripts/api-local/README.md) for coverage and limits.
The [API workflow](../../../.github/workflows/api.yml) runs both on every PR.

These checks do not deploy anything. The separate local Supabase proof remains
the authority for OAuth consent, session lifecycle and RLS behavior.
