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
- `account.ts` binds registered account operations to live OAuth authentication,
  input/output validation, safe errors and `no-store`. Account routes only
  export those handlers; they cannot provide an alternative authenticator.
- [Account projections](../account/account.ts) own organization pages;
  [the database adapter](../supabase/account-data.ts) supplies fixed queries with
  the same verified bearer and publishable key. It imports no cookie client and
  uses no privileged credential.

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

All account operations support authenticated HEAD and bodyless OPTIONS;
other methods return 405. Input and output share the existing no-store policy.
Credits OPTIONS accepts the bare route; any supplied query still must be valid.

Domain operations belong in their own modules and receive explicit authority
and inputs. They do not import Next, cookies or UI. HTTP adapters do not acquire
browser organization preferences or duplicate billing policy.

## Adding a route

1. Implement the domain operation and its authorization tests.
2. Add its declaration and implementation to the credential-specific adapter.
3. Add a thin route binding, with explicit method exports, using
   [the identity route](<../../app/(api)/(public)/api/v1/auth/me/route.ts>) as the pattern.
4. Run the checks below and add real HTTP coverage for new boundary behavior.

The source audit rejects unregistered routes, standalone account handlers,
miswired exports, dependency leaks and unowned environment reads. It resolves
relative imports, aliases and re-exports transitively. Tests include invalid
source trees to prove these checks fail. This is a development check, not a
sandbox against malicious repository code.

Six existing GG/catalogue routes are explicitly pinned legacy bindings. Their
authentication, streaming, error formats and caching remain owned by those
handlers. A new route cannot opt into that exception. Account OAuth bearers and
GG's `gg:ai` tokens remain different credential families.

## Configuration

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

Next configuration runs before proxy. Its web slash/connect redirects explicitly
exclude the API namespace and percent-encoded aliases. Account headers are set by
the adapter, never inherited from the legacy `/v1` CORS configuration.
Next still normalizes malformed repeated slashes/backslashes before proxy;
those framework redirects are outside the machine response contract.

## Check locally

```sh
pnpm --filter editor test:api
pnpm --filter editor test:api:http
```

The first command audits real source and runs offline contracts without loading
dotenv files. The second builds a minimal production-mode Next snapshot with the
real proxy, configuration and identity implementation, an owned synthetic issuer,
and recording replacements for unrelated web services. See the
[HTTP proof guide](../../../scripts/api-local/README.md) for coverage and limits.
The [API workflow](../../../.github/workflows/api.yml) runs both on every PR.

These checks do not deploy anything. The separate local Supabase proof remains
the authority for OAuth consent, session lifecycle and RLS behavior.
