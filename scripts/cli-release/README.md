# CLI package preparation and release

The `grida` npm package contains a Node 24+ launcher and all eight native
executables in one tarball. Installation has no dependencies, lifecycle scripts
or binary downloads. The launcher selects `binaries/<platform-id>/grida`
(`grida.exe` on Windows), distinguishing glibc and musl on Linux, and forwards
arguments, inherited streams, exit status and termination signals. The native
executable itself needs no Node runtime.

## Platform policy

The reviewed matrix lives in
[`platforms.json`](../../packages/grida-cli/native/platforms.json):

| Platform ID      | Rust target                | Minimum runtime         |
| ---------------- | -------------------------- | ----------------------- |
| darwin-x64       | x86_64-apple-darwin        | macOS 11                |
| darwin-arm64     | aarch64-apple-darwin       | macOS 11                |
| linux-x64-gnu    | x86_64-unknown-linux-gnu   | glibc 2.28              |
| linux-arm64-gnu  | aarch64-unknown-linux-gnu  | glibc 2.28              |
| linux-x64-musl   | x86_64-unknown-linux-musl  | musl; static executable |
| linux-arm64-musl | aarch64-unknown-linux-musl | musl; static executable |
| win32-x64        | x86_64-pc-windows-msvc     | supported Windows x64   |
| win32-arm64      | aarch64-pc-windows-msvc    | supported Windows arm64 |

Every installation contains the complete platform matrix. Durable account and
provider storage is supported on macOS/Linux; Windows retains the explicit
environment and stdin provider-key workflow. Unsupported targets fail with a
diagnostic. The launcher neither substitutes another architecture nor searches
PATH for an executable. A missing bundled executable requires reinstalling Grida.

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
node scripts/cli-contracts/installed.mjs --candidate "$PWD/.tmp/native-candidate"
```

`cargo-about` is a maintainer tool, not a CLI dependency. Its checked inventory
covers the production dependency closure for all eight targets. The package
includes the deterministic third-party license and notice texts, including
original composite license files that SPDX classification alone cannot replace.
The inventory records the Cargo.lock hash and preparation refuses stale notices.
The single notice source is `packages/grida-cli/THIRD-PARTY-NOTICES.txt`; the
generator also writes `packages/grida-cli/native/licenses.json`. The staged
package copies that notice source.

Preparation uses isolated npm configuration and cache, offline npm packing and
no lifecycle scripts. It verifies binary format/architecture and the exact packed
file boundary. `native-candidate.json` format 2 has one `package` record with its
archive hash/file list and eight `binaries` records with platform, target, bundled
path, binary hash and byte count. Verification reads the tarball without extraction
and compares its manifest, launcher, notices and all eight binaries with the
reviewed source and report. Windows archive reads use a validated basename and
an explicit working directory, avoiding GNU tar's drive-colon remote syntax.

The candidate records the actual tarball and unpacked sizes. Shipping all eight
executables increases each download; there is no separate platform-package
resolution or publication step. Measure complete release builds rather than
extrapolating from a local host fixture.

For local development, `native-fixture.mjs --binary /absolute/grida --out /absolute/out`
packs the real host executable with inert foreign image headers. The report marks
the fixture targets and publication refuses them. Tests exercise a fresh owned
npm registry with exactly one archive, verify that all eight binaries install,
and execute the host binary through the real launcher and npm command shim.
They also cover archive tampering, incomplete/retargeted binary records,
argument/stream/exit/signal forwarding, missing bundled executable failure,
ABI policy, immutable version collisions and release guards.

## Source and release manifests

The checked-out source manifest carries Rust build/test commands. Preparation
stages the reviewed files and eight compiled binaries, then writes a published
manifest without scripts or dependencies. Do not publish or pack the source
directory directly: source checkouts do not contain the release binaries.

Use `just cli-contracts` for the current native contract gate and see the
[contract prerequisites](../cli-contracts/README.md) for custody tools and docs
build requirements. The `native-*` commands above are the current release path.

## Release ownership

[`cli-verify.yml`](../../.github/workflows/cli-verify.yml) calls
[`cli-native.yml`](../../.github/workflows/cli-native.yml). That workflow builds all
eight targets, stages one candidate, installs that same tarball on each target,
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
checks hashes and proofs, then prints the single publication record without contacting npm.

Publication requires `CLI_NPM_RELEASE_ENABLED=true`, the `npm-publish` GitHub
environment and its reviewer/branch protections, and npm Trusted Publishing
through GitHub Actions OIDC. The trusted publisher for `grida` must authorize
repository `gridaco/grida`, workflow `cli-release.yml`, environment `npm-publish`,
and direct publication, not only staged publication. Keep the workflow filename
stable on the default branch. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
and [provenance](https://docs.npmjs.com/generating-provenance-statements/).
Do not configure `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or a token fallback.

`0.3.0-rc.1` was published using separate platform packages. Those immutable
versions remain historical releases; `0.3.0-rc.2` introduces the bundled layout.
No new `@grida/cli-*` versions or publisher setup are required for bundled releases.
The stable `latest` tag remains on `0.2.0` until a separately approved stable
release. Verify existing registry versions, tags and trusted-publisher authority
before dispatching a release.

The current workflow and publisher both enforce `main`, including releases under
`next`. A PR can build and install the complete candidate matrix but cannot
publish it through this path. Registry acceptance therefore follows merge unless
a separately reviewed release path is introduced. Publish a new prerelease to
`next`, test its exact registry version, and then prepare the stable release.
Changing the version or executable requires fresh candidate proofs; a prerelease
proof does not certify different stable bytes.

There is one immutable archive publication. Stable releases use `latest`;
prereleases use `next` and cannot replace `latest`. An already-published version
is accepted only when its archive integrity and selected distribution tag match.
Different bytes, changed tags, malformed registry metadata and read failures
stop before publication. A failed publish is not retried or repaired by moving
tags automatically.

The CLI remains independently versioned and excluded from Changesets planning.
Use the repository's [publisher wrapper](../publish-packages.mjs) for other
packages: it temporarily makes only the source CLI private while Changesets runs.

## After publication

After publishing a new CLI version, complete this smoke test from a clean
installation using the exact registry version. Local candidate tarballs do not
satisfy this check.

- [ ] Install `grida@<released-version>` from the public npm registry and record
      the package version, bundled platform path and executable hash. Exercise
      the supported release targets, including glibc and musl selection.
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

Disable the release environment to stop publication. Retain the exact candidate;
retry only if an already-published version has the same archive integrity and tag.
Never rebuild or overwrite an immutable version.

A maintainer can explicitly move the `grida` distribution tag to a previously
verified version and deprecate a broken version with a migration instruction.
Each bundled version carries its own complete binary matrix. Registry recovery
is never automatic.
