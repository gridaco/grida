# Installed CLI local proof

> **GRIDA-SEC-010 / GRIDA-SEC-011** — real native account custody in an owned
> local OAuth fixture. See [SECURITY.md](../../SECURITY.md).

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
  cleared credential envelopes, and survival of the other CLI session.

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
proof separately covers revocation and API/RLS details.

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
