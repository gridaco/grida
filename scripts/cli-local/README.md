# Installed CLI local proof

> **GRIDA-SEC-010 / GRIDA-SEC-011** — real native account custody in an owned
> local OAuth fixture. See [SECURITY.md](../../SECURITY.md).

## Native CLI acceptance

`native-proof.mjs` installs the exact verified native candidate using
`installNative`, then invokes its installed Rust executable in separate processes.
It accepts an already bootstrapped [owned OAuth fixture](../auth-local/README.md)
whose dedicated editor is running. It never starts, adopts, resets, or stops a
Supabase stack.

```sh
node scripts/cli-local/native-proof.mjs \
  --state /absolute/fixture/fixture.json \
  --candidate /absolute/native-candidate
node --test scripts/cli-local/native-proof.test.mjs
```

The candidate directory must come from the native release preparer. Local CI may
use `buildHostFixture` from `scripts/cli-release/native-fixture.mjs`; the selected
host executable is real, foreign headers are marked as inert fixtures, and such
a candidate cannot be published. The report records the package archive hash and the
installed executable hash.

The native proof covers manual browser consent with fresh PKCE/state, real code
exchange and identity, explicit file storage, process restart, independent native
profiles, occupied callback ports, cancellation cleanup, concurrent account reads,
cached credits and membership denial, local-session logout, and durable revision
advancement after empty logout. It does not open the OS keyring: default storage
metadata is inspected, then file custody is selected explicitly before session
access.

Children receive a constructed environment and private home. Browser routing
allows only the fixture origins; traces, screenshots, video and service workers
are disabled. Authorization URLs, seeded passwords and tokens remain in memory
or the disposable owned custody tree. All owned child processes, browser storage
and credential files are removed before the safe report is written to ignored
`.cache/cli-local/native-result.json`. The caller retains ownership of the stack
and editor. The auth-local workflow runs this installed proof while its fixture
editor is alive and preserves the existing TypeScript auth-package/keytar tests.

The native executable is not instrumented by Node preloads or an injected clock.
This command consequently makes no claim about forced-expiry refresh, expired
logout, or CLI network tripwire counts. Those remain covered by the mixed-process
auth contracts, controlled Rust transport tests, and the fixture's separate auth
proof. The native host itself pins its account endpoints. These checks do not
certify hosted registration, the system browser launcher, naturally expired JWTs,
Windows custody, or native keyring availability.

## Frozen TypeScript acceptance

The following `proof.mjs` and `linux-smoke.mjs` documentation describes the
TypeScript CLI before native cutover. That acceptance is frozen at revision
`b26ede1d62e21a0e24d52030538b8f7288ec9b4b` in Git history.
Run these legacy commands from a checkout of that revision with its dependencies
and fixture tooling; the current native npm candidate does not contain `dist/bin`
or keytar and cannot satisfy that legacy install contract. The legacy proof files
remain available, and their clock/preload checks are not silently claimed as
native coverage. Use the native command above for the current executable.

This proof prepares the current `grida` build through the shared
[candidate preparer](../cli-release/README.md), installs its tarball with npm into a
private temporary directory, and runs the installed executable in separate
processes. It uses the production `createPersistentNativeAuth` file backend.
There is no copied test custody, token injection, Desktop, daemon, or agent.

First build `@grida/auth`, `@grida/account`, and `grida`. Prepare, start, and
bootstrap the [isolated OAuth fixture](../auth-local/README.md), then launch its
dedicated editor. Follow that harness's pinned CLI/checksum and explicit local
Docker socket requirements. Do not source `editor.env` or use the ordinary editor
configuration. This proof requires an already running owned fixture; it never
starts, stops, resets, or adopts a stack itself.

With Node.js 24 and the repository's Playwright Chromium installed:

```sh
node scripts/cli-local/proof.mjs --state /absolute/fixture/fixture.json
node scripts/cli-local/proof.mjs --state /absolute/fixture/fixture.json --archive /absolute/candidate.tgz
node --test scripts/cli-local/network.test.mjs
```

`--archive` snapshots an existing bounded regular tarball into the owned fixture
instead of packing again, so local OAuth can test the same candidate as CI. The
installed manifest, file boundary and executable must match the current checkout.
The report records the archive hash. This real-issuer proof remains a separate,
fixture-owned acceptance command; normal CLI CI uses the synthetic media proof.

The runner uses only the validated fixture's public registration and seeded
local test credentials. CLI children receive the public registration path,
their own `GRIDA_HOME`, and a constructed private home/environment. A fresh npm
cache, empty npm configuration, `--offline`, `--ignore-scripts`, and
`--omit=optional` keep installation local. Omitting the optional keytar binding
proves its absence does not prevent help or explicit file custody; it does not
test the OS keyring.

The proof covers:

- Offline help, version, canonical documentation URLs, JSON errors, and
  noninteractive login refusal.
- Storage metadata, absent-keyring failure, explicit file migration, and
  persisted backend selection across processes.
- Both registered callback ports occupied, and cancellation releasing a pending
  login's listener.
- `auth login --no-browser` through the real browser login/consent pages. The
  authorization URL is read from stderr only in memory, never persisted in a
  report. The browser holds its own session; the CLI exchanges its own code.
- Two independent file profiles, restarted account/organization reads, cached
  credits selected implicitly or by slug/ID, and denial of another user's org.
- Concurrent installed processes sharing production custody and a real issuer
  refresh. For this one phase only, a preload advances the application's clock
  to ten seconds before its observed expiry. This avoids waiting an hour; JWTs,
  token exchange, issuer time, and credential files are unchanged by the harness.
- Safe offline failures, local status without network, session-local logout,
  cleared credential envelopes, and survival of the other CLI session. A second
  logout advances the application clock past its captured expiry and requires
  exactly one detached refresh without restoring credentials.

The CLI preload permits only the exact API/editor ports and callback listeners.
It records method/path counts without headers or bodies, rejects outside module
resolution, and blocks other network/subprocess access. The macOS production
custody owner's exact `/bin/ls -lde` ACL check remains real, restricted to the
owned tree and its ancestors. Browser routing permits only the fixture origins;
traces, screenshots, videos, service workers and provider calls are absent.

These are tripwires for a trusted repository/runtime, not an OS sandbox. The
guard, clock injection, real local issuer and manual browser path do not certify
hosted registration, the system browser launcher, Windows, native keyring
availability, or naturally expired JWT behavior. The fixture's existing OAuth
proof separately covers revocation of both captured and detached-rotation refresh
credentials, same-user session/browser preservation, and API/RLS details. Local
Kong is more permissive about the logout admission key than the hosted gateway;
the auth proof and unit tests enforce that header contract explicitly.

All CLI children, browser storage and temporary installation/profile files are
removed before a safe report is written under ignored `.cache/cli-local`.
Reports contain source hashes, runtime/platform and phase results; no tokens,
authorization URLs, raw process diagnostics or browser artifacts. The stack and
editor remain owned by the caller, who must stop them through the original
fixture workflow.

## Offline Linux smoke

`linux-smoke.mjs` accepts one absolute path to the actual packed `grida` tarball.
Run it as the unprivileged `node` user in a new disposable Node 24 container,
with networking disabled, a read-only root, a writable private `/tmp`, and only
an owned read-only directory containing that tarball and this script mounted at
`/input`. No repository, home, socket, environment file, or credentials belong
in the mount. Select the local Docker socket explicitly; retain the resulting
container ID and remove only that owned container afterward.

The container invocation is:

```sh
node /input/linux-smoke.mjs /input/grida.tgz
```

This exercises offline installation, help/docs, absent optional keytar, explicit
file migration, the real fixed loopback listener, manual login cancellation,
restart, status and empty logout. Its synthetic public-client registration never
contacts an issuer. It does not prove Linux OAuth or Linux keyring availability.
The recorded local runs passed on macOS arm64 Node 24.14.0 with real local OAuth,
and Linux arm64 Node 24.20.0 as UID 1000 with Docker networking disabled.
