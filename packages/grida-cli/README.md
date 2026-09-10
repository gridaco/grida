# Grida CLI

> **GRIDA-SEC-010 / GRIDA-SEC-013 / GRIDA-SEC-014** — independent account custody and CLI media authority;
> see [SECURITY.md](https://github.com/gridaco/grida/blob/main/SECURITY.md).

The `grida` command composes Grida's account services and tools for people and
their own harnesses. It runs independently of Desktop.

This README describes the Grida CLI 0.1 release line. Commands cover auth,
credential storage, identity, organization membership, cached credits, help/version
and docs.
Media commands discover models/schemas, inspect provider key presence, list speech
voices and generate image, video, music, sound effects, speech and supported 3D.
Agent, render and MCP are deferred.

Use Node.js 24 or later:

```sh
npm install -g grida
grida --version
grida --help
```

Stored credentials support macOS and Linux. Windows users can supply BYOK
through explicit environment variables or stdin; durable account login is not
supported there yet.

User documentation has one canonical home: the
[Grida CLI guide](https://grida.co/docs/cli). Contributor design lives in the
[CLI contract](https://grida.co/docs/wg/cli/v1) and
[doctrine](https://grida.co/docs/wg/cli/index).
Installed help describes implemented syntax; `grida docs [command...]` prints a
canonical URL without fetching it or opening a browser. No guide tree is bundled.
The [docs check](https://github.com/gridaco/grida/tree/main/scripts/cli-docs)
verifies actual guide examples, built routes and installed documentation links.

## Ownership

This is the branded executable and host adapter. Parsing, terminal output,
trusted registration, system-browser launch and process lifetime belong here.
Auth/custody belong to `@grida/auth`; account selection and reads belong to
`@grida/account`. Media commands consume `@grida/ai` through its public exports.
The SDK uses Grida's bundled service catalogue from `@grida/ai-models/grida`
for discovery and execution. The CLI does not refresh this catalogue or choose
a model/provider implicitly. A command does not move its product's implementation
into this package.

Do not import agent, daemon, Electron, Next.js or browser application state.
Do not add generic authenticated fetch, token getters, duplicated domain policy,
implicit login, silent provider fallback, or a plugin framework for hypothetical
commands. Validate syntax before initializing a host. SDK reads are separate
observations, not an atomic identity/membership snapshot.

## OAuth client registration

The production client ID, issuer, public project admission key, API origin and callback URLs live in
[`src/oauth-client-registration.ts`](https://github.com/gridaco/grida/blob/main/packages/grida-cli/src/oauth-client-registration.ts).
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

Build the auth/account/AI workspace dependencies, then `pnpm --filter grida build`.
Use `node packages/grida-cli/dist/bin.mjs --help` from the repository root.
The build bundles private workspace dependencies; the optional native
`@github/keytar` binding stays external and declared in the packed manifest.

Hosted custody uses `~/.grida/auth`, or the `auth` directory beneath an explicit
absolute `GRIDA_HOME`; it remains separate from Desktop sessions and provider
keys. Empty/relative auth home overrides fail instead of selecting another store.
For local development, set `GRIDA_CLI_LOCAL_CONFIG` to the fixture's absolute
public-client JSON path and `GRIDA_HOME` to a separate absolute private directory
outside your ordinary Grida home. This explicit override accepts only the fixed
local fixture issuer/API. Invalid local configuration never falls back to hosted
authentication. There is no repository or dotenv discovery. The
[installed-CLI proof](https://github.com/gridaco/grida/tree/main/scripts/cli-local)
owns the fixture setup and checks. Cross-platform CI, deployed account access and
npm release approval are release prerequisites.

The [release preparation](https://github.com/gridaco/grida/tree/main/scripts/cli-release)
owns candidate packing, independent CI publication and recovery. The package
ships third-party notices for its bundled dependencies; review that inventory
when changing the bundle.

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
`configure` additionally checks OpenRouter, Vercel and fal once before saving;
rejection, denial or an unavailable check leaves the old key unchanged. ElevenLabs
has no suitable permission-neutral check and saves with `verification.status` set
to `not_supported`. Successful supported checks report `accepted`, which proves
only that read was accepted now. Verification is never stored or repeated by
listing, availability, voice discovery or generation.
`providers list` shows presence, source and plaintext storage mode, not verified
access. The same native owner serves Desktop, independently of its lifetime.
Environment keys or `--key-stdin` override storage without opening it or persisting
input. Blank/malformed explicit keys fail; unset a variable to select storage.
Stored BYOK currently supports macOS/Linux only; Windows CLI users can supply
explicit environment/stdin keys. Account OAuth and ChatGPT stores remain separate.
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

The CLI owns a Node HTTP adapter with fixed provider routes, DNS-address
validation and pinning, and credential-free result downloads. It is independent
of the Desktop transport and sandbox. The
[installed synthetic media proof](https://github.com/gridaco/grida/tree/main/scripts/cli-media-local)
checks the packed executable without real provider calls. Deployed account/GG
access, actual provider compatibility and cross-platform release checks remain release gates.
