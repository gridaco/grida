# @grida/auth

> **GRIDA-SEC-010** — registered native account boundary; see the
> [security registry](https://github.com/gridaco/grida/blob/main/SECURITY.md).

Independent Grida native OAuth lifecycle. Private, experimental `0.0.0`; no
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
instance's refresh or coordinated verification; coordinated verification also
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
- No account/billing/media operations, GG token minting, provider OAuth registry,
  or generic authenticated URL fetch.
- No bespoke tokens, token-claim identity inference, social-PKCE fallback,
  Desktop deep links/cookies, global logout, or grant revocation.
- No Desktop/provider credential sharing, machine-wide store, or daemon lifetime.

## Verification

`test` runs producer contract tests and synthetic HTTP tests using only owned
loopback listeners. No running Supabase, production service, credentials, or
paid calls are needed. `typecheck` checks the package and neutral root separately;
`build` emits ESM/CJS exports and declarations.

Durable tests use private temporary homes, synthetic keyring bindings, and
separate processes. A real keyring smoke test is opt-in with
`GRIDA_AUTH_KEYRING_SMOKE=1`; it creates a random owned service/account, writes
synthetic values, and deletes only that entry. It never enumerates credentials.
