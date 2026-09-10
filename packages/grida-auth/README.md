# @grida/auth

> **GRIDA-SEC-010** — registered native account boundary; see the
> [security registry](https://github.com/gridaco/grida/blob/main/SECURITY.md).
> **GRIDA-SEC-006 / GRIDA-GG: token** — scoped GG grants go only to an explicit
> trusted memory sink.
> **GRIDA-SEC-014** — separate native provider API-key custody and private writer
> exclusion; see the [provider file protocol](PROVIDER-CREDENTIALS-V1.md).

Independent Grida native OAuth lifecycle and separate provider API-key custody.
Private, experimental `0.0.0`; no
compatibility guarantees yet. This package can be consumed without a CLI,
Desktop, Electron, an agent, or a daemon.

## Contract

The root exports `AuthClient` and its associated types. It uses only ECMAScript
and injected host capabilities; a separate TypeScript check excludes both DOM
and Node globals. `@grida/auth/node` exports `createNativeAuth` for Node 24+.
It also exports `createPersistentNativeAuth` for durable account access.

```ts
import type { AuthClient } from "@grida/auth";
import { createNativeAuth } from "@grida/auth/node";

// Trusted registration/configuration supplied by the host, never by a callback.
const config: AuthClient.Config = {
  clientId: "registered-public-client-id",
  issuer: "http://127.0.0.1:55431/auth/v1",
  apiOrigin: "http://127.0.0.1:3041",
  redirectUris: [
    "http://127.0.0.1:55435/callback",
    "http://127.0.0.1:55436/callback",
  ],
};

// In-memory custody for an infrastructure probe. These objects contain secrets.
let session: AuthClient.Session | null = null;
const custody: AuthClient.Custody = {
  async read() {
    return session;
  },
  async write(next) {
    session = next;
  },
  async clear() {
    session = null;
  },
};

// launchSystemBrowser is supplied by the native host. Do not log its URL or
// construct a shell command by interpolating it.
const auth = createNativeAuth(config, {
  custody,
  openBrowser: launchSystemBrowser,
});

const local = await auth.status();
const signedIn = await auth.login();
const verified = await auth.verify();
const refreshed = await auth.refresh();
const signedOut = await auth.logout();
```

`status`, `login`, `verify`, and `refresh` return safe metadata only: a state,
and, when present, `{id, email, display_name}` and access expiry in epoch
milliseconds. No access token, refresh token, authorization code, verifier,
or raw provider response is returned. `status()` is a local observation, not
proof that the issuer still accepts the session. `verify()` calls the fixed
bearer-only `/api/v1/auth/me` and refreshes near expiry when needed.

`logout()` returns `{state: "signed-out", revocation}`. Revocation is
`confirmed`, `unconfirmed`, or `not-needed`; a network failure does not restore
locally cleared credentials. It sends only `POST <issuer>/logout?scope=local`,
never global sign-out or application-grant revocation. Custody failures reject
instead of claiming local sign-out. Server behavior, including preservation of
other sessions and already-issued JWT lifetime, still needs the real issuer
integration proof.

Failures are `AuthClient.Failure` with a stable `code` and a fixed message.
Upstream error bodies and thrown host error messages are not exposed.

## Fixed account requests

```ts
const page = await auth.requestAccount("organizations.list");
// {organizations: [{id, name, display_name}], next_cursor: number | null}
const next =
  page.next_cursor === null
    ? null
    : await auth.requestAccount("organizations.list", {
        after: page.next_cursor,
      });
const credits = await auth.requestAccount("credits.read", {
  organization_id: 7,
});
```

These are the only account operations. Both send GET to the configured API
origin: `organizations.list` uses `/api/v1/account/organizations`, with only
the optional canonical `?after=<positive-safe-integer>` query; `credits.read`
requires `/api/v1/account/credits?organization_id=<positive-safe-integer>`.
Unknown operations and input keys are rejected before custody or network
access. Input values are captured once before awaiting. No user ID, page size,
URL, method, headers, raw response, or registration hook can be supplied.

`AuthClient.OrganizationsPage` is a secret-free wire view. Each page contains at
most 100 records with positive safe-integer IDs strictly increasing beyond
`after`, names of 1–39 characters, and string `display_name` values (including
empty strings). Extra response fields are discarded. `next_cursor` is null or
the final returned ID; null is the only completion signal. An empty terminal
page is a successful result, never a substitute for failure. Account selection,
iteration, presentation, and authorization rules stay with their respective
account and server owners; this package does not choose an organization.

`AuthClient.Credits` projects only `{organization, account_present, state,
source, currency, balance_cents, cache_updated_at, billing_gate}`. The organization
has the same safe fields as a page record and must match the requested ID.
`source` is `cache`; `currency` is `USD`. Signed safe-integer cents are cached
estimates, including genuine zero or negative values. A full RFC3339 timestamp
with timezone, optionally fractional, records cache updates, including optimistic
debits; it is not evidence of a fresh provider reconciliation.

- `not_provisioned`: no linked credit customer; balance and timestamp are null,
  gate is false/`not_provisioned`. `account_present` distinguishes an absent
  account from an account without a linked customer.
- `uncached`: the account and linked customer exist, but the display balance
  and timestamp are null. The server's cached gate can still allow or deny.
- `cached`: the account and linked customer exist, with integer balance and
  timestamp.

The gate is `{allowed: true, reason: null}` or `{allowed: false, reason:
"not_provisioned" | "below_floor" | "no_balance"}`. The last two reasons apply
to linked accounts only. Auth checks wire consistency and discards extras; it
does not calculate the billing floor, infer eligibility from the amount, apply
a freshness rule, contact providers, or promise AI readiness. Missing or
invisible organizations are the server's same forbidden result, never an
invented unprovisioned account or zero balance. Selection is caller-owned;
server authorization must be applied on every read.

Each request rereads custody and refreshes within the existing 30-second expiry
window before sending the account request. There is no automatic replay: 401 is
`token_rejected`, 403 is `forbidden`, other non-200 statuses are `unavailable`,
and invalid replies are `invalid_response`. A network error does not trigger a
refresh/retry. Accepted rotations remain stored if a later account request fails.
The Node transport's existing deadline, response-size limit, cookie omission,
and redirect refusal apply unchanged.

Coordinated custody holds profile authority through the fresh read, any refresh,
the account request, and result acceptance. Another process's logout or replacement
waits for that acceptance; acceptance is ordered before the later clear, though
process scheduling can deliver already accepted data afterward. Same-instance
logout cancels transport and fences results immediately, including a transport
that ignores cancellation. Logout cannot undo remote work or retract accepted
data. Memory custody retains its one-writer limitation and rejects a read if a
concurrent refresh changes its captured credentials. Login and account reads
cannot overlap on the same client; they fail with `session_busy`.

## Scoped GG access

`requestGgAccess({organization_id})` exchanges account authority for one scoped
Grida Gateway grant. The public result is only
`AuthClient.GgAccess`: `{organization: {id, name}, expires_at}`. There is no
account-token getter, caller-supplied destination, model-list operation or GG
cache. Organization selection belongs to the account owner; membership and
mint policy belong to the server. Minting does not establish credit eligibility
or provider readiness.

The trusted host opts in at construction with `gg: AuthClient.GgSink`. The
neutral `Host`, `createNativeAuth`, and `createPersistentNativeAuth` all accept
that same capability. Its bound `accept` function is captured once; replacing
the object or method later cannot redirect delivery. Only this host capability
receives `AuthClient.GgGrant`, the safe metadata plus `token`.

```ts
let grant: AuthClient.GgGrant | undefined;
const auth = createNativeAuth(config, {
  custody,
  openBrowser: launchSystemBrowser,
  gg: {
    accept(value) {
      grant = value;
    },
  },
});

try {
  const access = await auth.requestGgAccess({ organization_id: 7 });
  // The host may use the grant for its fixed GG operation, then discard it.
  // Only access is suitable for presentation; never log or return grant.
} finally {
  grant = undefined;
}
```

This sink is a **trusted synchronous, bounded memory recipient**, not a general
callback or an authorization extension. It must return `undefined`, never a
Promise, and must not start auth operations while custody authority is held.
It owns keeping the grant in memory and discarding it after use. The package
passes a frozen, projected grant and never adds it to the account session,
keyring, file envelope, status, or public method result. Those storage guarantees
do not constrain code the trusted host itself chooses to run.

Input is exactly one own positive-safe-integer `organization_id`, captured
before awaiting. The only request is POST to the configured API origin at
`/api/v1/auth/gg`, with that JSON body and the account bearer. The reply must
match the organization, contain a bounded compact-JWT-shaped token distinct
from the current account credentials, and provide a valid full timestamp in
the future, at most 16 minutes from the host clock. This bounds the existing
15-minute mint plus one minute of clock tolerance. Expiry is checked again
immediately before delivery. Extra fields are discarded. This validates the
trusted mint's envelope; it does not verify the GG signature locally or infer
account identity from token claims.

The exchange uses the same fresh custody read, near-expiry refresh and fixed
Node transport protections as account reads. A completed rotation survives
later mint or handoff failure. There is no automatic replay, remint or fallback.
HTTP 401 is `token_rejected`, 403 is `forbidden`, 429 is `rate_limited`, and
other non-200 statuses are `unavailable`; malformed replies are
`invalid_response`. A missing sink is `gg_unavailable` before custody or I/O;
invalid sink configuration is `invalid_config` at construction. Upstream bodies
and thrown sink errors are never exposed.

**Invoking the sink is acceptance**, under the existing custody authority and
generation fence. Same-client logout before invocation prevents delivery even
if transport ignores cancellation. Coordinated custody orders another writer's
logout before or after that acceptance. A later logout cannot recall an accepted
grant; it remains usable within the server's existing expiry window. A sink
that retains the grant and then throws (or incorrectly returns a Promise) yields
`gg_handoff_failed`, without claiming rollback or trying again. There is no
reusable GG session lifecycle here. Cache renewal, invalidation and paid-request
retry policy require a separate producer contract with the media owner.

## Native ceremony and transport

- Configuration accepts canonical HTTPS issuer/API origins or explicit local
  `http://127.0.0.1:<port>` origins. The issuer must end in `/auth/v1`.
  Production and local HTTP origins cannot be mixed. No discovery, redirect,
  or token payload can change this trusted binding.
- Redirects are an explicit list of fixed `http://127.0.0.1:<port>/<path>`
  addresses, registered ahead of time. There is no `localhost`, wildcard,
  port zero, query, fragment, or arbitrary ephemeral callback fallback.
  The Node adapter binds before opening the browser and tries the listed ports
  in order. If none bind, login fails before browser launch.
- Every login uses fresh 256-bit state and PKCE verifier, S256, and explicit
  `email profile` scopes. Code and refresh grants use form requests to
  `/auth/v1/oauth/token` with the public client ID and no client secret.
- The listener requires the exact GET path and Host, no Origin, one matching
  state, and exactly one code or error. Duplicate/unknown query parameters and
  state/shape mismatches fail without consuming the pending ceremony. An optional
  callback `iss` must match the configured issuer; a mismatched issuer is terminal.
  Valid denial is terminal. Callbacks
  are claimed once; receipt pages contain no callback values and make no claim
  that token exchange or persistence succeeded.
- Callback wait is bounded to two minutes. `cancelLogin()`, browser-launch
  failure, denial, timeout, and terminal completion close listeners and sockets.
  An accepted callback allows its receipt response to finish for up to one
  second before exposing the result; shutdown gives remaining connections one
  second to close before destroying them.
  Network requests have a 15-second deadline and a 64 KiB response limit.
  Credential-bearing requests never follow redirects, carry browser cookies,
  or forward upstream error bodies.

## Custody and concurrency

The host is trusted to protect `AuthClient.Session`; it binds secrets to the
issuer, client ID, and API origin. The neutral root performs no filesystem or
keyring I/O. Neither adapter inspects Desktop/browser/provider credentials.

The original `AuthClient.Custody` (`read`, `write`, `clear`) remains available
for memory hosts with one exclusive `AuthClient` writer. Its mutation queue and
generation checks protect that instance only. Do not share this uncoordinated
contract across independent clients or processes.

Shared custody implements `AuthClient.CoordinatedCustody` instead:

```ts
type CoordinatedCustody = {
  exclusive<T>(
    operation: (transaction: AuthClient.CustodyTransaction) => Promise<T>
  ): Promise<T>;
};
```

The host holds one profile's exclusive authority until the callback settles,
releasing it on success or failure. Transaction `read()` returns a fresh
`{revision, session}` snapshot. The opaque string revision is never reused and
changes durably after every successful `write(session)` or `clear()`, including
clearing an already empty session. Transaction methods are valid only within
that callback. Writes resolve after completion and must not publish partial
state before rejecting. **Callback failure does not roll back completed writes.**
The host owns bounded lock acquisition, durable revisions, storage protection,
and recovery after process failure; the neutral package supplies none of their
OS mechanisms.

Each client orders its own authority acquisitions; the host need not promise
FIFO admission across independent clients. With coordinated custody, refresh
and verification hold authority across the
fresh read, network requests, and writes. Verification can refresh without
reentering the lock. Explicit refresh requests from separate clients serialize
and use the latest refresh token; they are not coalesced across clients.
`status()` uses a short exclusive read and performs no issuer request. Login
captures the revision before browser interaction, releases authority during
consent, and checks the revision when committing the verified session. Logout
clears under the same authority even when already signed out, so a prior login
cannot recreate that session. Remote revocation uses the captured old session
after releasing authority; it cannot clear a newer login.

An accepted refresh rotation is saved before the separate live identity check.
Until that check succeeds, custody retains the previous access token, expiry,
and verified identity alongside the new refresh credential. Later failure or
cancellation never compensates that rotation with a spent refresh token.
Cancelled login writes may explicitly restore the prior session while still
exclusive, advancing the revision again. Host callback errors themselves never
trigger rollback. Issuer rotation and local persistence cannot be atomic; a
failure between them may still require a fresh login.

Refresh remains single-flight within one instance. Login cannot overlap that
instance's refresh, account reads, or coordinated verification; coordinated verification also
refuses an ongoing login with `session_busy`. Platform cancellation is
synchronous, idempotent, and nonthrowing. Pending host acquisition and I/O must
settle before their resources can be released; cancellation cannot revoke a
host's lock by itself. The neutral contract tests simulate shared authority;
they do not prove any particular OS lock, credential backend, or crash recovery.

## Durable Node custody

```ts
import { createPersistentNativeAuth } from "@grida/auth/node";

const { client, storage } = await createPersistentNativeAuth(config, {
  openBrowser: launchSystemBrowser,
  // storage: "file", // Explicit plaintext mode for hosts without OS storage.
});

await client.login();
await client.verify();
await storage.info(); // backend, opaque profile ID, initialization/migration state
await client.logout();
```

The initial backend defaults to `keyring`. A profile remembers an explicitly
selected `file` backend; omission on later runs preserves that choice. Supplying
a different backend for an established profile is an error. The factory returns
safe storage controls alongside the lifecycle; it never exposes the store's
secret-bearing transaction methods. Creating it validates the registration and
prepares private directories; backend access is lazy. `storage.info()` does not
read or unlock the keyring, though first use establishes profile metadata.

Profiles live beneath `@grida/home`'s `auth` directory and are bound to the
canonical home, issuer, client ID, and API origin. The `home` override is trusted
host configuration for isolation, never repository configuration. Directories
must be owned by the current user with `0700` permissions; regular credential
files require `0600` and one hard link. Unsafe paths, symlinks, loose permissions,
or extra macOS ACL allow grants fail without repairing existing directories.

Keyring mode uses the pinned `@github/keytar` native binding lazily. Its absence,
read/write failure, or failed read-back is a storage error, with no fallback.
The OS may prompt for access or unlock. The adapter cannot safely cancel a
native write, so it retains exclusivity until the call settles. Missing an
established keyring entry is an error; logout overwrites it with a secret-free
revision tombstone. No account tokens are written to metadata in keyring mode.
Linux requires a usable libsecret service; an unlock refusal cannot masquerade
as successful initialization or logout because every write is read back.

File mode stores plaintext in the private profile. Writes fsync a temporary
file, atomically replace the envelope, and fsync the directory. An error after
replacement may leave the complete new envelope committed; it never restores
spent credentials. Orphaned private temporary files are removed under the lock,
never adopted as sessions. This does not physically erase backups or snapshots.

The profile lock uses Node's SQLite OS locking, with no credential data in the
lock database. Acquisition is bounded to 30 seconds; a running operation is
never displaced by an expired lease. Process exit releases authority. All
credential mutations occur outside the SQLite transaction so later callback
failure cannot roll them back. Keep profiles on a local filesystem. The lock
database is private implementation state: do not open, replace, or delete it.

`await storage.migrate("file")` or `storage.migrate("keyring")` explicitly
changes backend under the same lock. Durable intent blocks auth operations
until the copy and old-backend cleanup finish. After failure, `info()` reports
`migration: "pending"`; repeat the same migration to resume. It never silently
uses the older backend. An uninitialized keyring profile can be recovered by
explicit file selection without opening that keyring. If metadata was manually
deleted, this cannot clean untracked OS entries. Deleting profile files is not
logout; use the lifecycle and migration operations to retain cleanup authority.

Current durable custody targets macOS/Linux main-thread Node hosts. Windows
ACL support and worker-thread custody are not implemented and fail closed.
The injected-custody factory remains platform independent within Node's
transport support. OS storage is not isolation from other authorized code
running as the same user. A crash between issuer rotation and durable saving
can still require login; no local adapter can make those two systems atomic.

## Anti-goals

- No supported `grida` commands, browser launcher, credential export command,
  or presentation layer.
- No account selection, billing policy or mutations, subscription/media operations,
  GG cache/catalogue/generation, provider OAuth registry, or generic authenticated
  URL fetch. Fixed organization pages, cached credits and the scoped GG exchange
  are transport only; other operations require a new producer contract.
- No bespoke tokens, token-claim identity inference, social-PKCE fallback,
  Desktop deep links/cookies, global logout, or grant revocation.
- No account credential sharing with Desktop/provider stores, machine-wide store,
  or daemon lifetime. The explicit provider export shares API keys only.

## Independent native provider credentials

`@grida/auth/providers` exports `ProviderCredentialStore`, an independent Node 24+
API-key owner. It needs no account login, application, daemon, model catalog, or
provider request. It never opens account custody. Construction accepts only an
explicit absolute canonical Grida home and performs no I/O.

```ts
import { ProviderCredentialStore } from "@grida/auth/providers";

const providers = new ProviderCredentialStore({ home: "/absolute/grida-home" });
await providers.set("example", "synthetic-api-key");
await providers.list(); // [{provider: "example"}], sorted presence only
const apiKey = await providers.read("example"); // secret: trusted SDK injection only
await providers.remove("example");
```

The single plaintext authority is `<home>/providers/credentials.toml`. Its private
0700 parent allows an existing Grida home to remain 0755; files are 0600. Unsafe
permissions, ownership, aliases, hard links, special files, or macOS ACL grants
fail closed without repair. Main-thread Node on local macOS/Linux filesystems is
supported; Windows ACL support and worker-thread coordination are unimplemented
and refuse I/O. Same-user processes, OS and dependencies are trusted.

Each operation takes a crash-released process lock, rereads current TOML, and
publishes complete mutations with file fsync, atomic rename and directory fsync.
Set/remove preserve other providers across independent processes. Read returns
the named key or null; list returns only IDs. Absence is never substituted for
an unreadable, corrupt, unsupported, or unsafe store. No method verifies a key
with a provider. Explicit caller-supplied credential overrides can bypass store
construction and I/O entirely; precedence belongs to the host.

The [language-independent v1 protocol](PROVIDER-CREDENTIALS-V1.md) defines UTF-8,
schema, exact ID/key bounds, failures, publication, locking and crash recovery;
its [synthetic fixtures](fixtures/providers-v1/README.md) are reusable by ports.
`ProviderCredentialStore.Failure` exposes only its stable code and fixed message.
Public diagnostics never include parser bodies, filesystem paths or key values.
The key returned by read and the input to set are deliberately secret-bearing.

### One-time import

The source owner retains decoding and retirement of its old format. Hold its
exclusive writer lock before `migrate`, through completion. Its lazy `read`
returns only API-key entries; `retire` durably removes those entries while
preserving unrelated records. Both callbacks are captured once, and must never
reenter either the source lock or provider store.

```ts
await sourceWriter.run(async () => {
  await providers.migrate({
    read: readLegacyApiKeys, // Promise<readonly {provider, apiKey}[]>
    retire: retireLegacyApiKeys, // idempotent durable Promise<void>
  });
});
```

Existing canonical values and pre-import deletion tombstones win. Import first
publishes a durable `pending` fence, then retires the source, then publishes
`complete`. A failed retirement leaves ordinary operations blocked with
`migration_pending`. Retry invokes only retirement, never rereads/imports stale
keys. Complete migration invokes neither callback. Source callbacks that fail
produce fixed `migration_failed` errors. Deletion preserves protocol metadata;
manually deleting the entire file or restoring old backups erases its fences.
Old applications that keep reading/writing the legacy file are not coordinated.

`@grida/auth/node` also exports `CredentialLock({directory})`, which supplies the
same native exclusion foundation to an independent credential-file writer. The
directory must be explicit, canonical, and private. `run(callback)` has a fixed
30-second acquisition deadline, never steals a running callback, and returns its
result. It does not read/serialize credentials or repair paths. Acquisition and
release errors are fixed `CredentialLock.Failure` codes; callback errors remain
the host's responsibility and are propagated unchanged. Migration's mandatory
lock order is source writer then provider store.

Provider anti-goals: no OAuth/keyring migration, account sessions, machine-wide
secrets, ambient/project credential discovery, provider network verification,
credential export command, backend plugin, or arbitrary file/connection getter.

## Verification

`test` runs producer contract tests and synthetic HTTP tests using only owned
loopback listeners. No running Supabase, production service, credentials, or
paid calls are needed. `typecheck` checks the package and neutral root separately;
`build` emits ESM/CJS exports and declarations.

Durable tests use private temporary homes, synthetic keyring bindings, and
separate processes. A real keyring smoke test is opt-in with
`GRIDA_AUTH_KEYRING_SMOKE=1`; it creates a random owned service/account, writes
synthetic values, and deletes only that entry. It never enumerates credentials.
