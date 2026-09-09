# Local machine API pipeline proof

> **GRIDA-SEC-012** — machine request isolation is bound by
> [SECURITY.md](../../SECURITY.md).

This proof builds and starts Next.js in **production mode**, then sends real
HTTP requests to the current `/api/v1/auth/me`, `/api/v1/account/organizations`,
`/api/v1/account/credits`, `/api/v1/auth/gg`, and `/api/v1/ai/models` implementations. It needs Node.js
24+, the repository's installed dependencies, and the compiled model catalogue.
It does not install packages,
start Docker, use Supabase services, or read account credentials.

```sh
pnpm --filter @grida/ai-models build
node --test scripts/api-local/network.test.mjs
node scripts/api-local/proof.mjs
```

The proof copies the current API operation inventory, request policy, account
adapters, account and cached-credit projections, RLS data adapters, shared credit
gate, GG mint/signer/verifier, static model list, bearer verifier, OAuth HTTP client,
routes, proxy, and Next configuration
into a fresh private `.cache/api-local` directory. It records their source
hashes. Existing installed dependencies are linked into the snapshot; dotenv
files, the ordinary editor environment, and existing build output are not copied.
Next receives a newly constructed environment, private HOME, and build directory.

The configuration wrapper changes only Turbopack's dependency resolution root
and its alias for the unrelated Edge Config test replacement. The original
headers, redirects, and other settings remain in effect. The test runs the real
Next build and server, without mocking `next/server`, requests, responses, the
proxy, API handlers, bearer verification, or GG signing/verification.

## Coverage and deliberate fixtures

The full web application is outside this build. A minimal layout and web route
replace unrelated pages. Web maintenance lookup, Supabase cookie refresh, and
tenant routing are replaced by recording tripwires. API, redirect, and blocked
insiders requests must leave those records empty. A positive web request must
record all three calls and emit its synthetic cookie, proving the tripwires are
active. This verifies dispatch and calls, not import-time behavior of the
original web modules. A fixture insiders handler must never run in production.

A newly owned loopback HTTP server supplies `/auth/v1/oauth/userinfo` and
synthetic `/rest/v1/organization`, `/rest/v1/organization_member`, and
`/rest/v1/v_billing_credits` responses. It accepts
only exact synthetic tokens issued in memory for two synthetic users. The real
bearer verifier performs its normal preflight and HTTP request. The database
fixture requires the exact caller bearer, publishable key, public schema and
fixed query shape; its per-user rows simulate visibility without implementing
Postgres RLS. Cases cover live
identity changes, two-user cache isolation, invalid credential classes, issuer
failure/revocation/mismatch/redirects, HEAD/OPTIONS and rejected methods/input,
unknown paths and hosts, forwarded-host spoofing, encoded path aliases, API
maintenance, invalid configuration, and production insiders gating. Organization
cases also cover 100-row pagination, a lower upstream row limit with exact count,
changed membership visibility using the same credential, empty pages, denied
selectors/cursors, database failures and method policy. Database failures must
never become successful empty pages. Ordinary
web redirects and legacy CORS headers are positive controls for the actual
Next configuration. Next normalizes repeated slashes and backslashes before
proxy; those raw syntax cases intentionally prove the framework's `308` response
without invoking account or web middleware. Other HTTP-parser failures can also
precede application JSON policy.

Cached-credit cases distinguish an absent account, an unprovisioned account,
an unobserved cache, and observed zero or negative balances. Explicit fixtures
exercise the existing credit floor and customer gate without deriving expected
results from the server implementation. An old cache timestamp does not add a
new freshness gate. Cases also cover exact organization selection, two-user
isolation, removed visibility, unknown organizations, body/query/method policy,
malformed rows, duplicate rows and inconsistent counts. Errors must never become
successful empty or zero-balance snapshots. The credits projection cannot expose
extra upstream fields. The fixture admits only the fixed read request; it does
not implement provider refresh, provisioning, subscription reads or mutations.

GG access uses a fresh signing key generated in memory. The real native mint
requires the exact same-user membership query and explicit organization before
signing; tests independently inspect its signature, audience, subject, organization
and 900-second lifetime. Its real GG token then reaches the existing model-list
handler. Account tokens cannot access that handler, and GG tokens cannot access
account operations or mint another token. Conflicting cookies or organization
headers supply no authority. Removed membership and a revoked account prevent
reminting; an already minted GG token retains its existing expiry window.

Mint cases cover its strict JSON shape and 1 KiB body bound, methods,
query rejection, exact database counts and safe upstream failures. Separate
server runs prove missing or short signing keys fail closed. Minting and model
listing make no credit query or fixture billing change. Upstash and provider
credentials are absent: quota behavior is covered by separate unit contracts;
no generation endpoint or paid provider is invoked. A model-list result proves
GG access, not credit eligibility or provider readiness.

Next.js 16.2.6 clones POST bodies for proxy and waits for their original EOF
before invoking the route. A finite delayed-upload case verifies no issuer or
membership work occurs before upload completion, then the valid request succeeds.
The route's one-second read deadline starts only when it receives the stream;
its separate unit contracts cover a stalled stream at that boundary. This HTTP
proof does not establish a network upload deadline or a pre-route 1 KiB limit.
Pre-route resource protection belongs to the hosting layer. Managed Vercel relies
on its documented request-size limits and slow-client protections; self-hosted
deployments must supply equivalent ingress controls. See the
[API hosting contract](../../editor/lib/api/README.md#configuration). This proof
does not certify a platform upload timeout.

This proves the **Next request pipeline**, not Supabase token cryptography,
OAuth consent, grant revocation, RLS, or hosted infrastructure. The separate
[local OAuth proof](../auth-local/README.md) covers the real Supabase flow.
The other legacy GG generation and public catalogue handlers are not built or
exercised here; their registered paths remain part of the copied inventory.

## Isolation and cleanup

The proof binds only fresh `127.0.0.1` listeners. Child fetch/TCP guards allow
only the explicitly owned ports, reject Unix socket access and other targets,
and refuse redirect following. They are application guards, **not an OS network
sandbox**: installed dependencies, native build tools, the repository, and the
same-user host are trusted. The harness never inherits proxy, Node preload,
Docker, hosted API, or telemetry credentials.

Tokens remain in memory and Authorization headers. Diagnostics redact bearer
values and JWTs; no browser state, request dumps, or credential artifacts are
written. Build and request waits are bounded. Cleanup targets only the child
process groups and listeners started by this run and removes its source, HOME,
and build directory. Private JSON reports and redacted build/server logs remain
under `.cache/api-local`; no artifact is uploaded.
