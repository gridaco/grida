# CLI contracts

Repository tooling verifies the native CLI's public behavior, the current
TypeScript SDKs that share its contracts, and the installed npm package. The
runner uses ordinary Rust tests, Node assertions, synthetic HTTP and native
custody fixtures. It is not a testing library or a second CLI implementation.

```sh
pnpm install --frozen-lockfile
just cli-contracts
```

The complete gate builds current TS consumers and documentation, checks all 449
CLI/parser vectors, verifies every advertised provider operation and generated
asset, exercises TS/Rust custody, and installs the native npm package for local
OAuth/account/provider/GG/artifact/signal and documentation checks. Empty or
skipped required tests, missing operation vectors and false proof reports fail
the gate. It does not fetch or build the retired TypeScript CLI.

macOS and Linux are required for the complete custody gate. Linux needs
`dbus-run-session`, `gnome-keyring`, `libsecret-1-dev`, and the existing optional
keytar binding. The native keyring gate checks exact-value interoperability and
production logout tombstones across all four TypeScript/Rust process pairings.
Each uniquely bound fixture entry is cleaned up by its creator; shipped custody
preserves revisions rather than deleting items.
On Linux the test creates a separate D-Bus session and private data directories.
The docs proof uses a network namespace; CI can set
`GRIDA_CLI_DOCS_SUDO_NETWORK=1` to elevate only the isolated, read-only native
child. No real provider key, account, or paid generation is used.

On macOS, explicitly opt in with `GRIDA_AUTH_KEYRING_SMOKE=1` when running the
complete gate. It creates uniquely labelled disposable entries in the default
keychain with access allowed to local applications. Their contents are literal
synthetic values; this gate verifies production custody and exact shared bytes,
not macOS application-authorization policy. The creator deletes only its own
labelled entries after the test; no existing item, default keychain or global
access setting is changed. Keychain lock and signing-partition checks may still
request system authorization. Without opt-in the check fails before accessing the keychain.
Ordinary Rust tests need no keychain authorization.

The macOS workflow additionally sets `GRIDA_AUTH_MACOS_CI=1` and runs
`auth-macos.mjs`. That wrapper requires GitHub-hosted macOS runner metadata and
both explicit flags before any keychain command. It creates a private temporary
keychain with a generated synthetic password, snapshots the runner's user-domain
default/search preferences, and directs the actual Node/keytar and Rust adapters
to that keychain. Only confirmed fixture items receive partition authorization,
matched by exact label, service, account, and keychain path, before each process
handoff or keytar operation. Executable signing identities are derived after the
Rust driver is built; this setup does not verify production application ACLs.
The wrapper terminates the owned test process group before restoring preferences
and deleting its keychain on normal completion or failure. If termination cannot
be confirmed, it leaves the private keychain selected for runner disposal.
Abrupt runner termination also relies on GitHub-hosted VM disposal; restoration
failures fail the gate. This path is unavailable to ordinary developer runs.
Pure guard, command-scope, failure-cleanup, and process-lifetime tests run on
both supported hosts. The hosted workflow runs the complete native custody proof
on its disposable runner.

## Focused checks

```sh
# Native CLI argv and parser contracts: no Keychain or provider access.
node --test scripts/cli-contracts/cli.test.mjs scripts/cli-contracts/catalogue-request.test.mjs
node scripts/cli-contracts/run.mjs --cli-only
node scripts/cli-contracts/run.mjs --list

# Fast Rust provider/input/fault/HTTP regression checks.
just cli-provider-contracts

# Continuing TypeScript SDK consumers against the same reviewed fixtures.
pnpm exec turbo run build --filter=@grida/ai...
node scripts/cli-contracts/catalogue-media.mjs --check
node scripts/cli-contracts/catalogue-inputs.mjs --check
node scripts/cli-contracts/catalogue-errors.mjs --check

cargo test --workspace --all-features --locked
node --test scripts/cli-contracts/auth-process.test.mjs
node scripts/cli-contracts/installed.mjs
```

`--cli-only` runs every CLI/parser vector and explicitly reports that integration
checks were not requested. The complete command omits that flag. Both build the
current Rust source and use the executable paths reported by Cargo, including
custom target directories; neither certifies a stale binary from a default path.

`cli-provider-contracts` needs no TS build, credentials, Keychain access or paid
calls. It checks request-comparison controls, Rust media/input/fault contracts
and native HTTP behavior with synthetic data and local sockets. Paid live smoke
is a separately budgeted acceptance exercise, not an ordinary edit or CI
prerequisite; see the [provider testing policy](../../crates/grida-ai/README.md#provider-contract-baseline).

## Expectations and ownership

`cases.json` contains stable IDs, argv, optional literal stdin and expected
exit/stdout/stderr. These are reviewed golden expectations originally established
during the TS-to-Rust migration and now maintained as CLI regression contracts.
CLI vectors launch real executables with disposable homes and working directories,
bounded output/deadlines and no inherited credentials. Offline cases deliberately
use an absent host registration and require no home or working-directory writes.

Parser-only vectors call the production parser through a thin JSON-lines driver.
The Rust driver is built only with `conformance` and is never distributed.
Its explicit test DTO keeps internal Rust enums independent of golden JSON and
supports validation without dispatching commands or acquiring authority.

`checks.mjs` runs ordinary Cargo/Node commands for the shared and installed
contracts. The three `catalogue-*` commands verify the continuing TS/web consumers
against the provider fixtures. `catalogue-vectors.mjs` derives the expected
operation set from the current advertised SDK descriptors. Each operation needs
a successful wire/result exchange, accepted and rejected inputs, a transport
failure, provider refusal and cancellation controls. Missing or duplicate
operations fail. Rust replays the same fixtures without contacting providers.
See [AI vectors](../../crates/grida-ai/tests/fixtures/README.md).

Intentional contract changes require review of the changed behavior and the
smallest corresponding expectation. CI only checks fixtures; it never records
new results automatically. Do not regenerate expected results merely to hide a
regression. Existing fixtures have migration provenance in Git history; no
historical CLI build is required to change or test the current implementation.

Mixed-process auth checks exercise the current TS/Rust custody owners in all four
writer/reader pairings. The continuing TS provider store is shared with Desktop;
Desktop's browser account session remains separate from native CLI account custody.
A small [custody fixture](../../packages/grida-auth/fixtures/account-v1/custody.json)
retains the historical account storage bytes. These checks do not claim compatibility
with historical writers that ignore the current locking or migration protocol.

## Installed and release checks

`installed.mjs --candidate /absolute/candidate` consumes the exact verified npm
archive. Without that option it builds a host fixture to test packaging locally;
reports identify fixture targets, and publication rejects them. The installed
proof uses real loopback HTTP and the native executable, with no Node network or
clock injection. [Real Supabase/browser acceptance](../cli-local/README.md) runs
separately in its owned database/editor fixture.

Local completion does not assert remote CI or hosted acceptance. The eight real
platform builds, exact-candidate installed matrix, real local OAuth, hosted
registration/account/GG and applicable live-provider acceptance remain release
prerequisites. The release workflow requires the shared contract job and tests
the same candidate archive before publication.
