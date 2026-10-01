# Contributing to the Grida CLI

> **GRIDA-SEC-010 / GRIDA-SEC-013 / GRIDA-SEC-014** — independent account custody and CLI media authority;
> see [SECURITY.md](https://github.com/gridaco/grida/blob/main/SECURITY.md).

This package-local guide covers implementation contracts, development and release
checks. For installation and usage, see the [Grida CLI guide](https://grida.co/docs/cli).

The package `README.md` is the public npm page and the single source used by
release packaging. Keep it short and focused on users; maintain architecture,
security IDs and development notes here. Platform packaging and support policy
live in the [release guide](https://github.com/gridaco/grida/blob/main/scripts/cli-release/README.md).
The [documentation checks](https://github.com/gridaco/grida/tree/main/scripts/cli-docs)
verify guide examples, built routes and installed documentation links.

## Ownership

The [grida-cli crate](https://github.com/gridaco/grida/tree/main/crates/grida-cli)
owns parsing, terminal output, trusted registration, browser launch, process
lifetime, bounded files and transport. The
[grida-auth crate](https://github.com/gridaco/grida/tree/main/crates/grida-auth)
owns account authentication, custody and account reads. The
[grida-ai crate](https://github.com/gridaco/grida/tree/main/crates/grida-ai)
owns catalogue queries, input validation and provider operations. Rust and the
continuing TypeScript/web packages consume the same neutral
[catalogue data](https://github.com/gridaco/grida/tree/main/data/ai)
and [input schemas](https://github.com/gridaco/grida/blob/main/data/ai/inputs.json).
The CLI does not refresh this catalogue or choose a model/provider implicitly.
The npm launcher only selects the matching binary and forwards the invocation.

Do not import agent, daemon, Electron, Next.js or browser application state.
Do not add generic authenticated fetch, token getters, duplicated domain policy,
implicit login, silent provider fallback, or a plugin framework for hypothetical
commands. Validate syntax before initializing a host. SDK reads are separate
observations, not an atomic identity/membership snapshot.

## OAuth client registration

The production client ID, issuer, public project admission key, API origin and callback URLs live in
[`crates/grida-cli/src/host.rs`](https://github.com/gridaco/grida/blob/main/crates/grida-cli/src/host.rs).
These public values are intentionally versioned in Git and bundled with the CLI.
The CLI host consumes them; the shared auth SDK remains registration-agnostic.
Changes must stay aligned with the Supabase OAuth app and Grida server allowlist.
Issuer/client/API changes also affect existing credential profile identity.
The public project key is sent only to the fixed issuer logout endpoint;
rotating that key does not change credential profile identity. It is distinct
from the OAuth client ID and from every user/provider credential.

Account commands use this hosted public registration:
Grida's HTTPS issuer/API and the two registered loopback callbacks. Public client
metadata is not a secret or proof of binary identity. No environment variable or
repository file can override the hosted issuer, API origin or client ID.
Hosted consent/API deployment and own-account acceptance remain release gates.

## Local development

Use the exact Rust toolchain in
[`rust-toolchain.toml`](https://github.com/gridaco/grida/blob/main/rust-toolchain.toml).
From the repository root:

```sh
cargo run --locked -p grida-cli --bin grida -- --help
cargo test --workspace --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
```

Rust builds do not need Node or compiled TypeScript packages. Native OS keyring
adapters are linked into the binary; there is no optional keytar addon. npm
candidates are staged by the release scripts, not by packing this source
directory. The source manifest intentionally omits unpublished platform packages;
the preparer supplies their exact versions in the published launcher manifest.

Hosted custody uses `~/.grida/auth`, or the `auth` directory beneath an explicit
absolute `GRIDA_HOME`; it remains separate from Desktop sessions and provider
keys. Empty/relative auth home overrides fail instead of selecting another store.
For local development, set `GRIDA_CLI_LOCAL_CONFIG` to the fixture's absolute
public-client JSON path and `GRIDA_HOME` to a separate absolute private directory
outside your ordinary Grida home. This explicit override accepts only the fixed
local fixture issuer/API. Invalid local configuration never falls back to hosted
authentication. There is no repository or dotenv discovery. The
[installed native proof](https://github.com/gridaco/grida/blob/main/scripts/conformance/installed.mjs)
owns synthetic local OAuth/account/media checks. The separate
[local-Supabase/browser proof](https://github.com/gridaco/grida/tree/main/scripts/cli-local)
checks the actual local issuer integration. Cross-platform CI, deployed account access and
npm release approval are release prerequisites.

The [release preparation](https://github.com/gridaco/grida/tree/main/scripts/cli-release)
owns candidate packing, independent CI publication and recovery. The package
ships third-party notices for its bundled dependencies; review that inventory
when changing Cargo.lock.

Node.js 24 or later is required. Durable auth currently supports macOS and Linux;
Windows auth fails closed. An unavailable keyring never selects file storage
implicitly. See the
[credential custody contract](https://grida.co/docs/wg/cli/credential-custody).

`--json` emits a safe public result or `{ "error": { "code", "message" } }` to
stdout; diagnostics use stderr. Exit codes are 0 (success), 1 (operation failure)
and 2 (usage). `--no-input` prevents terminal questions; OS keyring access may
still ask for permission. Interactive login rejects `--json` and `--no-input`.
`auth login --no-browser` prints a sign-in URL for manual opening on the same
machine. Signals cancel login; an in-flight credential write is allowed to settle.

## Media access and files

`grida models list` and `models inspect` are offline and credential-free.
Listing shows accepted local-image flags; `models list --local-image` keeps only
operations accepting `--reference FILE` or `--image FILE`. The column, JSON
`local_image_flags`, filter and inspection guidance derive from the SDK schema.
The [media contract](https://grida.co/docs/wg/cli/media) owns examples, schemas,
variants, availability and result rules. Installed help stays minimal.

BYOK saves keys to `~/.grida/providers/credentials.toml`, or
`$GRIDA_HOME/providers/credentials.toml` when `GRIDA_HOME` is an absolute path,
without Grida login. `providers configure <provider>` stores a key using hidden input
or `--key-stdin`; `providers remove <provider>` removes the shared stored key.
All selected keys (file, environment or stdin) pass cheap static validation through
[the shared provider policy](https://github.com/gridaco/grida/blob/main/packages/grida-ai/README.md).
`configure` additionally checks OpenRouter, Vercel AI Gateway, fal and Tripo once before saving;
rejection, denial or an unavailable check leaves the old key unchanged. ElevenLabs
has no suitable permission-neutral check and saves with `verification.status` set
to `not_supported`. Successful supported checks report `accepted`, which proves
only that read was accepted now. Verification is never stored or repeated by
listing, availability, voice discovery or generation.
`providers list` shows presence, source and plaintext storage mode, not verified
access. Rust and Desktop's TypeScript owner implement the same versioned custody
protocol and coordinate through the same process lock, independently of app lifetime.
Environment keys or `--key-stdin` override storage without opening it or persisting
input. Blank/malformed explicit keys fail; unset a variable to select storage.
Stored BYOK currently supports macOS/Linux only; Windows CLI users can supply
explicit environment/stdin keys. Account OAuth and ChatGPT stores remain separate.
First-party Tripo uses `TRIPO_API_KEY`, `--key-stdin`, or the shared `tripo` slot.
The CLI does not load dotenv files.
GG needs account login and an organization through the selected registration
above. The auth owner hands a scoped grant into
one invocation's memory store; account tokens never enter provider execution.

For manual file configuration, follow the
[provider file format and editing instructions](https://github.com/gridaco/grida/blob/main/packages/grida-auth/PROVIDER-CREDENTIALS-V1.md).
Stop Desktop and other Grida processes using this home before editing; keep
the `providers` directory at `0700`, the file at `0600`, and preserve version
and migration metadata. `grida providers --help` also prints the location and
format link without opening the credential store.

`generate` accepts `--prompt`/`--prompt-file`, `--text`/`--text-file` with `--voice`
for speech, ordered `--reference` inputs and a single `--image`. `--param FIELD=VALUE`
sets advertised scalar fields; complex requests retain the exclusive `--input @file|-`
mode. Both lower to the same SDK input parser. Media flags select a compatible
variant; they never switch provider, model or billing route. Human `models inspect`
shows inputs and an example; `--json` keeps the full descriptor.
The fal Veo 3.1 Lite route accepts `--param generate_audio=false` for silent video;
omission retains the provider's audio-enabled default. Unadvertised routes refuse it.

Tripo model generation uses `--provider tripo` for BYOK or `--provider gg` for
Grida credits, independently of fal's 3D routes.
`models list --provider tripo` lists its executable models and variants. Text uses
`--prompt`; a supported single-image variant uses `--image` with a local PNG/JPEG.
Multiview uses `--variant multiview --input @input.json` with the advertised inline
image schema. JSON does not expand paths or read referenced local files. With
BYOK, uploaded images and generation requests go to Tripo's fixed API; result
downloads use the SDK's reviewed Tripo data origin. The CLI saves returned GLB bytes with its usual
safe local receipt and never performs an automatic generation retry.

Mesh eligibility and rigging use a separate command group:

```sh
grida rigging list --provider tripo
grida rigging inspect --provider tripo --feature rig-check --json
grida rigging inspect --provider tripo --feature rigging --model tripo/rig-v1.0 --json
grida rigging check --provider tripo --mesh ./character.glb --json
grida rigging run --provider tripo --model tripo/rig-v1.0 --mesh ./character.glb --rig-type biped --spec mixamo --out ./rigged --json
```

Listing and inspection are offline. Eligibility has no model identity and returns
`riggable`, `rig_type` and a provider task receipt; a negative eligibility result
is a successful check (exit 0). Checking never starts rigging. `rigging run`
explicitly submits paid rigging and saves the returned GLB with feature, model,
binding, hashes and safe task ID/consumed-credit metadata in `receipt.json`.
The model's SDK schema determines accepted rig types and specifications. These
operations use the existing Tripo environment, stdin and shared-store key resolver
when `--provider tripo` is selected. With `--provider gg`, they use the existing
Grida login and `--org` / `--org-id` organization selector. GG does not inspect
BYOK keys, accept `--key-stdin`, or fall back to the Tripo account.

```sh
grida rigging check --provider gg --org studio --mesh ./character.glb --json
grida rigging run --provider gg --org studio --model tripo/rig-v1.0 --mesh ./character.glb --rig-type biped --spec mixamo --out ./funded-rigged --json
```

GG obtains a signed upload receipt using the selected organization, uploads
actual bounded bytes to the exact Tripo S3 origin with no credential headers,
and submits one hosted operation. Hosted output is decoded from bounded JSON
into the same GLB files and receipts. Scoped-token expiry and insufficient
credits stop execution without automatic retries. GG Tripo requests allow up
to thirteen minutes for upload and provider completion.

`--mesh` snapshots one regular GLB file up to 60,000,000 bytes, with the same
bounded input lifetime as other media files. The SDK validates its complete
self-contained GLB contract. Alternatively, `--input @file|-` accepts the public
JSON schema with base64 mesh bytes, under the existing 16 MiB JSON bound; it cannot
mix with `--mesh`, `--rig-type` or `--spec`. No input URL or path inside JSON grants
a local read or fetch. The paid command validates its input and probes the fresh
output directory before credentials or submission. Accepted task IDs survive safe
failure output, including a failed local save. Neither command retries submission.

Explicit file paths resolve from the working directory. Text uses UTF-8; local
PNG/JPEG/static WebP images use content-based header admission, without pixel
decoding or transcoding. Files are read once with bounded bytes and lifetime.
Local images are capped at 8 MiB each, aggregate image reads at 16 MiB, and the
assembled JSON at 16 MiB including base64 expansion. SDK limits can be lower.
No arbitrary JSON string is a file grant; no input URL is fetched by this host.
Inline input support belongs to the selected operation's public schema. See the
[media contract](https://grida.co/docs/wg/cli/media) for current route coverage.

`generate` validates input and probes a fresh output directory before authority
or paid submission. It saves artifacts and a safe receipt with local paths and
hashes. Existing files are never replaced. A failed save reports already
published files; no paid operation is automatically replayed. Signals abort
media requests, while credential writes and saving already-returned bytes are
allowed to settle.

The CLI owns a Rust HTTP/1 adapter with fixed provider routes, DNS-address
validation and pinning, and credential-free result downloads. It is independent
of the Desktop transport and sandbox. The
[installed synthetic media proof](https://github.com/gridaco/grida/blob/main/scripts/conformance/installed.mjs)
checks the packed executable without real provider calls. Deployed account/GG
access, actual provider compatibility and cross-platform release checks remain release gates.
