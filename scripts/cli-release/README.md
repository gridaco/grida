# CLI package preparation and release

The native `grida` npm package is a small Node 24+ launcher with eight exact-version
optional platform packages. The executable itself needs no Node runtime. npm's
`os`, `cpu` and `libc` filters select the platform package; installation runs no
lifecycle scripts and downloads no binary outside npm. The launcher forwards
arguments, inherited streams, exit status and termination signals.

## Platform policy

The reviewed matrix lives in
[`platforms.json`](../../packages/grida-cli/native/platforms.json):

| npm suffix       | Rust target                | Minimum runtime         |
| ---------------- | -------------------------- | ----------------------- |
| darwin-x64       | x86_64-apple-darwin        | macOS 11                |
| darwin-arm64     | aarch64-apple-darwin       | macOS 11                |
| linux-x64-gnu    | x86_64-unknown-linux-gnu   | glibc 2.28              |
| linux-arm64-gnu  | aarch64-unknown-linux-gnu  | glibc 2.28              |
| linux-x64-musl   | x86_64-unknown-linux-musl  | musl; static executable |
| linux-arm64-musl | aarch64-unknown-linux-musl | musl; static executable |
| win32-x64        | x86_64-pc-windows-msvc     | supported Windows x64   |
| win32-arm64      | aarch64-pc-windows-msvc    | supported Windows arm64 |

Each platform package is named `@grida/cli-<suffix>`. Durable account and provider
storage is supported on macOS/Linux; Windows retains the explicit environment
and stdin provider-key workflow. Unsupported targets fail with a diagnostic;
the launcher does not choose another architecture or search PATH for a substitute.
A missing optional package explains how to reinstall with optional dependencies.

GNU binaries build on their native architecture inside PyPA's
[`manylinux_2_28` images](https://github.com/pypa/manylinux#manylinux_2_28-almalinux-8-based),
with the exact Rust version from `rust-toolchain.toml`. The build executes the
binary in that glibc 2.28 environment, rejects newer glibc symbol requirements,
and rejects unexpected unbundled shared libraries. A newer Ubuntu runner does
not raise the ABI minimum. musl builds compile native C dependencies with
`musl-gcc` and link Rust's self-contained musl runtime with the host `cc` driver.
Using the `musl-gcc` wrapper as Rust's linker can produce an x64 static-PIE binary
that crashes at startup ([Rust issue 95926](https://github.com/rust-lang/rust/issues/95926)).
Before execution and packaging, musl builds reject ELF interpreters and shared
library dependencies; a static PIE's own dynamic section is permitted. Installed
proofs run inside the official Alpine Node image. macOS sets deployment target 11.0.
Windows uses its native architecture and MSVC target.

## Preparing a candidate

Use the pinned Rust toolchain, Node 24 and npm 11.5.1 or newer. Build each target
on its matching OS and architecture; GNU builds additionally need Docker.
Choose new absolute output directories.

```sh
node scripts/cli-release/native-build.mjs --target aarch64-apple-darwin --out "$PWD/.tmp/native-artifacts"
```

Collect all eight `<rust-target>/grida` (Windows: `grida.exe`) directories under
one artifact root. The build records the version, source revision, lock hash,
binary hash and GNU ABI checks alongside each executable. Refresh notices when
the lockfile changes:

```sh
cargo fetch --locked
cargo install cargo-about --version 0.8.2 --locked
node scripts/cli-release/native-notices.mjs
node scripts/cli-release/native-notices.mjs --check
node scripts/cli-release/native.mjs --artifacts "$PWD/.tmp/native-artifacts" --out "$PWD/.tmp/native-candidate"
node scripts/cli-release/native.mjs --verify --out "$PWD/.tmp/native-candidate"
node scripts/cli-release/native-proof.mjs --out "$PWD/.tmp/native-candidate"
node scripts/conformance/installed.mjs --candidate "$PWD/.tmp/native-candidate"
```

`cargo-about` is a maintainer tool, not a CLI dependency. Its checked inventory
covers the production dependency closure for all eight targets. Every package
includes the deterministic third-party license and notice texts, including
original composite license files that SPDX classification alone cannot replace.
The inventory records the Cargo.lock hash and preparation refuses stale notices.
The single notice source is `packages/grida-cli/THIRD-PARTY-NOTICES.txt`; the
generator also writes `packages/grida-cli/native/licenses.json`. All staged
packages copy that same notice source.

Preparation uses isolated npm configuration and cache, offline npm packing and
no lifecycle scripts. It verifies binary format/architecture and the exact packed
file boundary. `native-candidate.json` records all nine archive hashes, file lists
and binary hashes. Verification reads tarballs without extraction and compares
manifests, launcher files and notices with the checked-out source.

The candidate also records actual compressed sizes for an all-binary comparison
archive and the launcher plus each selected platform archive. Compare these
measurements from a complete matrix build; they quantify the download saved by
platform selection. Do not extrapolate from one host binary or use fixture sizes
as release measurements. The all-binary comparison is never published.

For local development, `native-fixture.mjs --binary /absolute/grida --out /absolute/out`
packs the real host executable with inert foreign image headers. This exercises
npm package selection, archive verification and installation without pretending
to have compiled other architectures. Its report marks the fixture targets and
publication refuses them. `node --test scripts/cli-release/native.test.mjs` uses
this approach and additionally proves argument/stream/exit/signal forwarding,
missing/version-mismatched dependency failure, ABI policy and release guards.

## Source and release manifests

The checked-out source manifest and published manifest have different roles.
The CLI source package carries the Rust build/test commands and does not depend
on unpublished platform packages. The pinned reference installs its own reviewed
TypeScript dependency closure in its isolated directory. The native preparer writes
the eight exact-version optional dependencies into the packed launcher manifest.
Do not publish or pack the source directory directly.

The shared target gate, including `just cli-conformance-target`, requires a frozen
workspace install and a current docs build (`pnpm --filter docs build`). See the
[conformance prerequisites](../conformance/README.md) for native custody tools.
The former TypeScript CLI is extracted from its pinned Git revision into the
isolated reference directory; it is no longer a workspace implementation.
The old `prepare.mjs` and Node-preload proofs describe the TypeScript archive
boundary and are retained reference tooling. They cannot prepare or verify a
native release; use the `native-*` commands above.

## Release ownership

[`cli-verify.yml`](../../.github/workflows/cli-verify.yml) calls
[`cli-native.yml`](../../.github/workflows/cli-native.yml). That workflow builds all
eight targets, stages one candidate, installs those same tarballs on each target,
and runs native OAuth/account/media proofs on macOS/Linux, including Alpine.
[`cli-docs.yml`](../../.github/workflows/cli-docs.yml) checks installed help and
schemas against the public guides with networking disabled by an OS perimeter.
The local-Supabase/browser and API workflows remain separate release prerequisites.
Synthetic transport checks do not prove hosted registration or real provider acceptance.

The [OAuth deployment reference](../../editor/lib/auth/README.md) owns service
configuration and hosted verification. Green CI does not deploy that configuration,
activate Supabase registration or publish the documentation site. Verify those
separately before authorizing publication.

[`cli-release.yml`](../../.github/workflows/cli-release.yml) is manual and main-only.
It verifies the reviewed non-placeholder source version and native cutover marker,
runs the delivery/docs/auth/API workflows, and downloads the exact verified
candidate and all eight installed reports. The publish job does not rebuild.
`native-publish.mjs --dry-run --out /absolute/candidate --version VERSION --tag next`
checks hashes and proofs, then prints publication order without contacting npm.

Publication requires `CLI_NPM_RELEASE_ENABLED=true`, the `npm-publish` GitHub
environment and its reviewer/branch protections, and npm Trusted Publishing
through GitHub Actions OIDC. Configure the trusted publisher for **all nine
package names**: `grida` and the eight `@grida/cli-<suffix>` names. Each must authorize
repository `gridaco/grida`, workflow `cli-release.yml`, environment `npm-publish`,
and direct publication, not only staged publication. Keep the workflow filename
stable on the default branch. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
and [provenance](https://docs.npmjs.com/generating-provenance-statements/).
Do not configure `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or a token fallback.

Before the first native release, a package maintainer must establish the eight
platform packages and their publisher permissions. A public registry 404 is not
proof of name availability or publish authority. npm requires an existing package
before a trusted publisher can be configured; the release workflow cannot
bootstrap those permissions itself. Resolve initial publication with the
maintainer, then verify trust for all nine package names before dispatching a
release. See [npm trust prerequisites](https://docs.npmjs.com/cli/v12/commands/npm-trust/#prerequisites).

The current workflow and publisher both enforce `main`, including releases under
`next`. A PR can build and install the complete candidate matrix but cannot
publish it through this path. Registry acceptance therefore follows merge unless
a separately reviewed release path is introduced. Publish a new prerelease to
`next`, test its exact registry version, and then prepare the stable release.
Changing the version or executable requires fresh candidate proofs; a prerelease
proof does not certify different stable bytes.

The platform packages publish first; the launcher publishes last, after all
exact-version dependencies exist. Stable releases use `latest`; prereleases use
`next` and cannot replace `latest`. Existing identical immutable versions can
resume an interrupted release; changed archive bytes fail. A changed distribution
tag also fails and requires explicit maintainer recovery instead of silently
undoing that change. Review the registry's existing versions and tags before
choosing a new version. No package names are assumed to have empty history.

The CLI remains independently versioned and excluded from Changesets planning.
Use the repository's [publisher wrapper](../publish-packages.mjs) for other
packages: it temporarily makes only the source CLI private while Changesets runs.
Platform packages are generated release outputs, never workspace packages.

## After publication

After publishing a new CLI version, complete this smoke test from a clean
installation using the exact registry version. Local candidate tarballs do not
satisfy this check.

- [ ] Install `grida@<released-version>` from the public npm registry and record
      the launcher version, resolved platform package and executable hash. Exercise
      the supported release targets, including npm's Linux libc selection.
- [ ] Check help, docs, model discovery and provider configuration/listing. Verify
      that existing provider credentials remain usable without exposing key values.
- [ ] Complete browser login, inspect status, restart the CLI, read identity,
      organizations and credits, then log out. Confirm a separate existing session
      remains usable and compare the results with the local installed-candidate proof.
- [ ] With an explicit spending budget, save a representative BYOK artifact and
      one GG artifact, validate their formats and receipt hashes, and confirm no paid
      submission is retried automatically. Auth and discovery checks alone need no
      generation spend.
- [ ] Record results and any registry, platform, hosted-auth or provider failures;
      revoke the test login and remove only test-owned profiles and outputs.

## Recovery

Disable the release environment to stop new publication. A failure before the
launcher publishes leaves the previously released launcher intact. Retain the
exact candidate and resume only if already published archive integrity matches.
Do not rebuild the same version or overwrite immutable platform packages.

To roll back, a maintainer can move the `grida` distribution tag to a previously
verified version. Its exact optional dependencies select the matching older
binaries; platform tags do not choose the installed executable. Deprecate the
affected launcher version with a clear migration instruction when appropriate.
These are explicit registry mutations, not automatic recovery actions. Already
installed clients remain installed; ship a corrective version and preserve their
server compatibility. Do not default to unpublishing. See the
[installed-client policy](https://grida.co/docs/wg/cli/v1#installed-client-compatibility).
