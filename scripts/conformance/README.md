# CLI conformance

The migration gate compares the native CLI with an immutable TypeScript
reference and runs ordinary Rust tests, Node assertions, native custody checks,
and installed npm proofs. It is repository tooling, not a testing library.

```sh
pnpm install --frozen-lockfile
just cli-conformance-target
```

The target gate builds both implementations and the documentation, checks the
runner itself and every argv/parser vector,
replays all advertised provider operations, checks generated-data drift and
current TS consumers, exercises mixed-language custody, and installs the native
npm package for local OAuth/account/provider/GG/artifact/signal and documentation
checks. It rejects pending inventory, missing operation vectors, empty test runs,
skipped native checks, failed commands, and false proof reports.

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
both supported hosts. Unattended macOS behavior remains unqualified until the
complete workflow passes on a GitHub-hosted runner.

Useful focused commands:

```sh
just cli-provider-contracts
node scripts/conformance/prepare.mjs
node --test scripts/conformance/cli.test.mjs scripts/conformance/catalogue-request.test.mjs
node scripts/conformance/run.mjs --list
node scripts/conformance/run.mjs --implementation ts
cargo test --workspace --all-features --locked
node --test scripts/conformance/auth-process.test.mjs
node scripts/conformance/installed.mjs --reference
node scripts/conformance/installed.mjs
```

`cli-provider-contracts` needs no prepared TS build, credentials, Keychain access
or paid calls. It checks request-comparison guards, all Rust media/input/fault contracts
and native HTTP behavior with synthetic data and local sockets. The complete
gate additionally verifies the baseline against the pinned and current TS
implementations. Paid live smoke is an explicitly budgeted acceptance exercise,
not an ordinary edit or CI prerequisite; see the
[provider testing policy](../../crates/grida-ai/README.md#provider-contract-baseline).

`--implementation ts|rust|both` defaults to `both`. The default `completed` suite
runs all TS vectors, completed Rust vectors and completed integration checks.
`--suite target` additionally refuses every unfinished required contract or
compatibility decision. A passing subset is not a complete migration.

## Immutable reference

`baseline.json` pins revision `b26ede1d62e21a0e24d52030538b8f7288ec9b4b`,
CLI version 0.2.0, the selected package/dependency paths and their source digest.
`prepare.mjs` extracts those exact Git objects into ignored
`target/conformance/reference`, installs its locked dependencies, builds its
package closure and records the resulting bundle digest. CI must fetch that
revision (`fetch-depth: 0`). Working-tree changes and removal of the old CLI
implementation cannot silently change the oracle. Both source and bundle hashes
are checked before reference execution. The bundle digest covers every pinned
workspace package's entire `dist` tree, including CJS/ESM entrypoints, sibling
chunks and runtime data. Fake-tree tamper controls reject changes and missing
entrypoints without modifying the real reference. Each Rust run builds the
current source.

A deliberate contract update requires review of the old/new behavior, updated
vectors and inventory, an explicit decision for each observable difference, and
a new revision/digest in `baseline.json`. Recreate the reference and rerun both
sides. Do not regenerate expected results merely to hide a Rust regression.

The same pinned `@grida/auth` implementation is the supported TS CLI/Desktop
provider-custody baseline. Mixed tests cover all four TS/Rust process pairings.
This does not claim compatibility with historical writers that ignore the
current lock or migration protocol. Desktop's browser account session remains
separate from native CLI account custody.

## Evidence and boundaries

`cases.json` contains stable IDs, argv, optional literal stdin and expected
exit/stdout/stderr. CLI vectors launch real executables with disposable homes and
working directories, bounded output/deadlines and no inherited credentials.
Offline cases deliberately use an absent host registration and require no home
or working-directory mutations. TS runs also use its existing host tripwires;
those Node hooks do not instrument native code.

Parser-only vectors use thin JSON-lines drivers calling the production parsers.
The Rust driver is built only with `conformance` and is never distributed.
Its explicit DTO keeps internal Rust enums independent of the TS representation.

`checks.mjs` runs standard Cargo/node commands and links their IDs into
`inventory.json`. The inventory also lists each exact provider operation.
Every operation needs a recorded successful wire/result exchange, admitted and
rejected inputs, transport failure, provider refusal and cancellation controls.
The Rust tests replay TS-captured synthetic exchanges; the three `catalogue-*`
scripts verify those fixtures against both the pinned reference and current TS.
See [AI vectors](../../crates/grida-ai/tests/fixtures/README.md).

`installed.mjs --candidate /absolute/candidate` consumes the exact verified npm
archive set. Without that option it uses the current real host binary and inert
foreign-target headers to test packaging locally; reports identify every fixture
target, and release publication rejects them. The installed proof uses real
loopback HTTP and the native executable, with no Node network/clock injection.
[Real Supabase/browser acceptance](../cli-local/README.md) runs separately in its
owned database/editor fixture.

Local completion does not assert remote CI or hosted acceptance. The eight real
platform builds, exact-candidate installed matrix, real local OAuth, hosted
registration/account/GG and applicable live-provider acceptance remain release
prerequisites. The release workflow requires the shared conformance job and tests
the same candidate archives before platform-first, launcher-last publication.
