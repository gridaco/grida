# grida-cli

The Rust implementation of the independent `grida` executable. The npm launcher
and platform package preparation live in
[`packages/grida-cli`](https://github.com/gridaco/grida/tree/main/packages/grida-cli).
The crate implements auth and custody commands, account and organization reads,
provider configuration, model/voice discovery, image/video/music/sound/speech/3D
generation, and Tripo/GG rigging. Agent, render and MCP commands remain deferred.

## Ownership

- `grammar.rs` and `assets/help` own syntax and offline help. Parsing acquires no
  credential, browser, file or network authority. `help.rs` owns docs routing.
- `main.rs`, `runtime.rs`, `error.rs` and `output.rs` own dispatch, safe terminal
  projections, cancellation and process exit. Usage exits 2; operation failures
  exit 1. JSON results/errors go to stdout; human errors go to stderr. Closed
  output pipes fail without a panic or a second diagnostic.
- `host.rs` owns the shipped public OAuth registration, explicit isolated local
  fixture registration, home admission and system browser launch. `account.rs`
  lends the bounded account transport to `grida-auth` and projects account results.
- `credentials.rs` resolves only the invocation's explicit environment/stdin or
  selected shared provider store. `grida-auth` owns the on-disk custody protocol,
  cross-process locking, native keyrings, OAuth lifecycle and account service calls.
- `input.rs` lowers advertised CLI flags through `grida-ai`'s operation rules.
  `files.rs` bounds explicit local file/stdin reads and publishes artifacts and
  receipts without overwriting existing files. Output preflight precedes authority
  acquisition and paid submission.
- `http.rs` and `http_wire.rs` own fixed route/header admission, public DNS answer
  validation and address pinning, original-name TLS verification, and bounded
  HTTP/1 parsing. Connections have no ambient proxy, cookie jar, pool or automatic
  paid retry. Response heads, interim responses, trailers, bodies and absolute
  lifetimes are bounded; credential-free downloads have an explicit redirect cap.

The CLI invokes `grida-ai` through its typed media transport boundary and
`grida-auth` through its account transport boundary. Those crates do not import
CLI process or terminal state. Rust and the continuing TypeScript/web packages
consume the shared neutral catalogue/schema files. The CLI uses its bundled
catalogue without refreshing it or choosing a provider/model implicitly.

## Build and verify

```sh
cargo run --locked -p grida-cli --bin grida -- --help
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo test --workspace --all-features --locked
cargo build --workspace --locked
```

The workspace pins its toolchain in
[`rust-toolchain.toml`](https://github.com/gridaco/grida/blob/main/rust-toolchain.toml)
and dependencies in
[`Cargo.lock`](https://github.com/gridaco/grida/blob/main/Cargo.lock).
Ordinary Rust builds need no Node.js or generated TypeScript artifacts. The npm
launcher and repository conformance scripts use Node.js 24+. Native OS keyring
support is linked into the executable; no keytar addon is required at runtime.
Durable account/provider storage supports macOS/Linux. Windows supports explicit
BYOK environment/stdin keys and fails closed for unsupported durable custody.

The [release tooling](https://github.com/gridaco/grida/tree/main/scripts/cli-release)
produces eight exact-version platform packages and one launcher package, verifies
installed archives, and owns the glibc 2.28 baseline, bundled notices and publication
order. Packing the source directory is not a release path.

## Conformance

The `conformance` feature adds `grida-conformance`, a test-only process driver for
the production parser, catalogue/input projections and bounded file behavior.
It is not a second parser or public SDK. Normal builds omit the test driver.

```sh
node scripts/conformance/prepare.mjs
node scripts/conformance/run.mjs --implementation both --suite target
```

The preparer extracts and verifies the pinned TypeScript revision in its isolated
reference directory, installs its exact dependency closure and builds the Rust
drivers. The shared gate covers command and SDK contracts, mixed TS/Rust custody,
installed npm execution, local OAuth/account/GG media, artifact safety and docs.
The [conformance harness](https://github.com/gridaco/grida/tree/main/scripts/conformance)
owns the reference digest, vectors, integration checks and coverage inventory.
Update public help and reviewed expectations together when the contract changes.
Synthetic local proofs do not replace actual Supabase/browser or hosted-provider
release acceptance.
