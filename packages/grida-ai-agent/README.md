# `@grida/agent`

Retained services and client-safe contracts for Grida's native agent hosts.
Private, `workspace:*`, in active development. Native chat execution belongs to
the application host; this package distributes no chat scheduler or session store.

The daemon owns the loopback perimeter and file/workspace services. This package
supplies media HTTP operations, provider settings and custody, the native ChatGPT
subscription host, sandbox intent, transport and presentation contracts. Shared
model operations belong to [`@grida/ai`](../grida-ai/README.md).

Storage-agnostic [`fs`](./src/fs/README.md), [`todos`](./src/todos/README.md),
artifact surfaces and vision primitives remain available independently of a chat
loop. Neutral protocol and historical session-row types remain readable without
opening or migrating a database.

## Exports

Subpath exports gate platform reach: a bare `import "@grida/agent"`
stays browser-safe, and the Node-only entry points are quarantined
behind their own subpaths so they never pull `node:*` into a client
bundle.

| Subpath                 | What                                                                                                                                          | Platform |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `.`                     | protocol contracts, native/BYOK provider metadata, safe status, run/stream DTOs, tool-name vocabulary, tiers and historical session-row types | neutral  |
| `./tiers`               | model tier constants (`AGENT_TIERS`, `AGENT_DEFAULT_TIER`)                                                                                    | neutral  |
| `./fs`                  | virtual fs + file tools ([README](./src/fs/README.md))                                                                                        | neutral  |
| `./fs/backends/opfs`    | browser OPFS backend                                                                                                                          | browser  |
| `./todos`               | plan store + `todo_write` ([README](./src/todos/README.md))                                                                                   | neutral  |
| `./surface`             | server-executed artifact-surface tools, turn snapshot, and browser observer                                                                   | neutral  |
| `./media-server`        | `createMediaTenant` + `createMediaDaemon`, media options and provider transport type; no chat startup                                         | Node     |
| `./chatgpt-host`        | `ChatGptSubscriptionHost` and `ChatGptProviderConfig`; host-owned OAuth and captured subscription requests                                    | Node     |
| `./vision`              | image perception primitives                                                                                                                   | neutral  |
| `./tools/design-search` | reference search tool vocabulary and result contracts                                                                                         | neutral  |
| `./sandbox`             | composed sandbox policy (`buildAgentDaemonSandboxPolicy` — daemon frame + AI upstream hosts)                                                  | Node     |
| `./transport`           | `AgentTransport` namespace — extends `DaemonTransport.Client` with the agent tenant's routes                                                  | neutral  |

The Node fs backend (`NodeFsBackend`) is internal + test-only — it is not a
public subpath; workspace bindings use it in-process.

## Retired chat execution

`@grida/agent/server` is no longer exported or built. The root no longer exports
`createAgent`, `createToolset`, `composeSystemPrompt`, or their construction types
(`Agent`, `AgentCallOptions`, `AgentMessage`, `CreateAgentOptions`, `ModelFactory`,
`RunCommandBackend`, `RunCommandOutcome`, `ToolsetCapabilities`). Hosts use their
native conversation owner for chat and `media-server` for retained HTTP services.
Daemon lifecycle, discovery and shell contracts come from `@grida/daemon/server`.
Scratch preparation remains at `@grida/agent/sandbox`; subscription configuration
comes from `@grida/agent/chatgpt-host`. There is no disabled compatibility wrapper.

Only `dist` is included in the package file allowlist. Drizzle and the ACP SDK
are development dependencies for the historical database fixtures and ACP
harness; retained runtime and declaration artifacts import neither library.
Source-only historical execution remains owned by this package's regression fixtures: `src/server.ts`,
`src/runtime/`, `src/agent/`, `src/session/` database/store code, and the agent,
session and directory-scope HTTP routes. The source-only ACP development harness
is owned by `src/agent-provider/`. These fixtures preserve prior behavior and
readability for explicit migration studies; they are not supported application
entrypoints. Retained scratch preparation and row types share `src/session/`
but do not load its database/store. Historical tool assembly, prompts and skills remain with those fixtures.
Retained provider adapters and standalone tool primitives are built only through
the public entrypoints listed above. Never start a historical fixture against personal state as a
fallback for a failed native host.

## Shared media operations

The image HTTP route uses `@grida/ai`'s `ImageClient`.
This package adapts shared native provider custody and provider transport, chooses
the media default model, and selects the existing automatic provider policy.
The SDK resolves compatibility and executes the selected provider. The host
reads reference files and persists returned bytes to media storage.

Product presets and native compatibility data come from `@grida/ai/catalogue`, which joins Grida membership,
legacy status, tiers, request presets and optional recommendations to the neutral
`@grida/ai-models` facts. Native/BYOK metadata stays pinned to that installed
seed. Media routes share the host's separate bounded GG discovery store; hosted
music also uses current GG operation contracts.
Sound effects, speech and typed native 3D adapters retain their bundled inputs. The optional image default
is used only when the caller has not chosen a model. Explicit legacy selections
remain valid while the service still admits them.

The shared operation does not retry a failed paid batch. Requesting multiple
images can still require multiple submissions under the provider's batch limit.
Image failures contain safe codes; raw upstream errors and warnings do not enter
the host's image error logs.

The video HTTP route uses `VideoClient` with the same host capabilities. The SDK
checks the selected binding's text/start-frame support before submitting, reads
the selected credential at invocation, and returns video bytes with safe failure
codes. One video submission, its polling, and result reads share a five-minute
deadline and the caller's abort signal. A BYOK credential stays fixed for that
job; changing credentials cannot move accepted work to another account. Clearing
GG custody blocks subsequent invocations but cannot recall an accepted request.
The route retains its wire protocol, GG status mapping and media receipts.

The music HTTP route uses `MusicClient` with GG authority and provider transport;
it does not receive BYOK keys. The SDK validates current GG music operation
contracts, supported text/seed input and a bounded MP3 response. The route converts bytes to its
existing wire shape, derives the canonical model filename, and adds an optional
root-level storage receipt. The ten-minute music deadline covers submission,
polling and download. Accepted failures retain a safe request ID; session refresh
resumes that job with GET-only reads, including after catalogue retirement. GG
refresh remains with the host. Music, sound
effects and speech have separate contracts under the audio modality.

The sound-effects HTTP route uses `SoundEffectClient` with only an ElevenLabs
key reader and provider transport. The SDK owns the existing model selection,
text/duration/loop/influence validation and bounded MP3 execution. The route owns
base64 output, `sound-effect.mp3`, optional root-level receipts and missing-key
recovery status. It supplies no GG authority and performs no result download.

The text-to-speech routes use `TextToSpeechClient` for generation and voice
discovery. The SDK owns text/voice validation, bounded pagination and projected
voice IDs/names, while the host owns picker choices, missing-key/access-denied
status, `speech.mp3`, wire encoding and optional root-level receipts. Speech
text is preserved verbatim; the SDK descriptor supplies the normalized voice ID.

The 3D route uses `ThreeDClient`'s exact model contracts. The SDK owns input
semantics, fal queue execution and bounded primary GLB bytes; the host owns
structural request admission, bounded base64 decoding, `model.glb`, wire encoding,
optional root-level receipts and its one-generation-at-a-time memory budget.
Catalogue options beyond the implemented single-image/text paths are not exposed
by this route. Future 3D workflows need their own reviewed host wire adaptations.

The model-generation route uses `TripoClient` for explicit Tripo BYOK or Grida credits. Model
identity (H3.1, P1 or P2 Preview) is separate from the explicit model-generation
feature and its text, image or named multiview input. `AgentTransport.Client`'s
`modelGeneration.generate` accepts the SDK JSON input, with base64 in image
`data` fields, under a 48 MiB total request limit. The SDK validates inputs
before credential access and returns an uncompressed, self-contained GLB.
The host returns GLB bytes, a safe task ID and reported Tripo credits, plus
an optional media receipt. Tripo account credit failures remain attributed to
Tripo. Accepted work is never resubmitted after a timeout or download failure.
Remeshing and other processing operations need distinct feature contracts;
they are not advertised by this generation route. The existing `three_d` host
capability gates the 3D generation and mesh-processing route groups.

The rigging routes independently use the neutral SDK `RiggingClient` and
`RiggingOperations`. `AgentTransport.Client.rigging.check` returns structured
eligibility and a safe task receipt without creating media or inventing a model
identity. `rigging.generate` accepts an explicit rig model, rig type and spec,
then returns portable GLB bytes and an optional media receipt. Both requests
carry inline base64 GLB mesh data, bounded by the SDK's 60,000,000-byte limit;
no source paths or provider URLs are accepted. One check or rig operation holds
the group's memory reservation from body admission through result persistence.
Input bytes and existing saved media remain unchanged; rigged output is a new
media item. The routes use explicit Tripo BYOK or GG through the host transport, never
switch funding accounts, and never resubmit accepted work after failure. They are mounted in
the retained media composition.

## Independent media startup

Hosts can import `createMediaDaemon` from `@grida/agent/media-server` to run the
existing media routes without importing the chat runtime, opening a chat
SQLite database, discovering skills or starting ACP. Shared provider custody
lazily uses SQLite only for its private cross-process lock after startup. It uses the same daemon perimeter and host-owned credentials,
provider transport and media store. Media and BYOK settings default on; GG
routes require `gg_base_url`. Chat, sessions, endpoint-provider settings,
native ChatGPT auth and shell remain absent. `createMediaTenant` supplies the
same composition for hosts that already own a `DaemonServer`.

```ts
import { createMediaDaemon } from "@grida/agent/media-server";

const daemon = createMediaDaemon({
  password,
  user_data_path,
  provider_home, // Explicit shared Grida home; omit for an isolated embedded host.
  media_root,
  http_access,
  provider_http,
  gg_base_url,
});
await daemon.start({ listen: false });
// Deliver authenticated Requests through daemon.fetch(request).
// Stop aborts and joins active delivered requests before clearing GG custody
// and disposing the catalogue. Persisted BYOK keys remain host-owned.
await daemon.stop();
```

Choose one media composition per launch to avoid duplicate credential stores or
routes. The native host can prepare scratch through `@grida/agent/sandbox` and
use `CHATGPT_AUTH_ROUTE_PATHS` and `ChatGptAuthStart` from the neutral root.
The separate `ChatGptSubscriptionHost` owns the private OAuth ceremony and
subscription requests; route names and DTOs grant no credential authority.

The daemon's `SecretsStore` now delegates BYOK persistence to the shared
native TOML owner (GRIDA-SEC-014). The native host supplies `provider_home`;
media and agent code continue to receive only a key reader. Hosts select their provider home explicitly. ChatGPT OAuth remains in the daemon's separate `auth.json` and GG stays
in memory. Directory references and finite-command scopes protect both the
agent state root and the shared provider directory.

## Provider HTTP

Node hosts may pass `provider_http` to `createMediaTenant` or
`createMediaDaemon` when provider traffic cannot use the process-global
`fetch`. The value has two required operations:

- `request` executes provider-owned media traffic, hosted operations,
  configured-endpoint health checks, discovery and media job submit/poll/result
  requests. The separate subscription host uses its own narrow `post` callback
  for token exchange and captured Responses requests.
- `download` executes credential-free provider result/asset downloads,
  including URL inputs that the AI SDK must lower to bytes before a model
  call. The host authorizes each concrete origin; the contract does not grant
  arbitrary public-web access.

Omitting `provider_http` preserves ambient `globalThis.fetch` only for provider
`request` operations for standalone TypeScript hosts. Remote `download`
operations fail closed because the package cannot bind DNS and redirect checks
to an ambient fetch connection; inline `data:` assets are still decoded
locally. When a transport is supplied, both functions are required together so
a host cannot unknowingly leave one class of traffic on ambient networking.
The callback is an authority boundary, not a pre-authorized execution hook.
Before I/O, the host must inspect and authorize the concrete URL, method, and
headers; enforce its credential-forwarding policy; authorize every redirect
hop; and validate the resolved address/route (including DNS rebinding posture).
Configured endpoints may intentionally be local, so this decision belongs to
the host environment. The package owns provider-specific request shaping,
credential injection, basic URL syntax checks, response parsing, and download
byte bounds—not the host's destination or routing policy. Each automatic asset
lowering batch is refused above private, non-configurable count and aggregate
decoded-byte caps, and its host downloads are consumed sequentially. A callback
rejection is terminal; there is no ambient-download fallback.

Provider result URLs are narrower than the callback's general authorization
surface. OpenRouter video ignores third-party `unsigned_urls` and fetches only
its authenticated, same-origin content endpoint. Vercel AI Gateway video accepts
only inline `data:` results or its exact configured Vercel AI Gateway origin; an
arbitrary result origin fails with `unsupported_untrusted_result_origin`, and
an exact remote origin still requires the host download transport. Vercel AI Gateway image
responses are base64 strings on the provider request lane and
never open the download lane.

Image generation accepts optional native `background` intent (`auto`, `opaque`,
or `transparent`) through `/images/generate` and `generate_image`. Omitted/auto
retains provider defaults. Explicit modes require verified native-background
support on the selected catalogue binding, independently of any reference-image
capability; unknown or unsupported routes fail before generation. Selection
never drops the requirement or substitutes background removal. Transparent
requests capture that intent in the resolved adapter and force PNG after raw
provider options. Generated bytes are saved unchanged, preserving alpha.
Hosted requests enforce the same admission locally and forward the requirement
for independent server-side validation before billing.

GPT Image 2.5 Flare and Sunburst bind Vercel AI Gateway, OpenRouter, and fal. Vercel AI Gateway
and fal
have verified native-background controls; OpenRouter's published endpoint schema
does not expose transparency. Reference-conditioned generation is available on
OpenRouter and fal; transparent edits require fal because Vercel AI Gateway reference
bindings are not yet verified. OpenRouter uses the same canonical model id for
generation and edits, while fal uses separate `/text-to-image` and `/edit` routes.
All three accept the six quality levels through their own provider namespace.
Typed SDK seed is unsupported on GPT Image 2.5's OpenRouter and fal routes; fal
also rejects typed aspect ratio, using explicit dimensions or auto size instead.

The callbacks are never exposed to tools, shell commands, or external-agent
processes. There is deliberately no public fixed-destination manifest: hosted
and BYOK endpoints are selected dynamically, and the host authorizes the
concrete request it receives while the package's sandbox policy remains the
coarse declarative allowlist. A host that routes these callbacks outside the
sidecar sandbox should build that policy with
`host_routed_provider_http: true`; direct BYOK/GG egress is then removed,
making missed ambient provider calls fail closed.

Hosts that require the sandboxed process tree—including raw shell and ACP
children—to have no direct outbound destinations can additionally select
`direct_network_access: "none"`. This empties `allowed_domains` across daemon
development hosts and all agent-contributed hosts. Local socket binding is
orthogonal: it remains enabled by default for compatibility, and a host with a
listener-independent request transport can pass `allow_local_binding: false`.
The outbound default for this TypeScript policy is `"allowlisted"`.

## Anti-goals

The perimeter that keeps this package small. A feature request that
crosses one of these is the wrong tool, not a missing feature.

- **Not a general model-provider router.** Provider selection is
  isolated to the node-only `providers/` layer: the BYOK key slots
  (OpenRouter → Vercel AI Gateway) plus ONE generalized OpenAI-compatible
  endpoint type (`{base_url, optional key, registered models}` — Ollama
  is the preset; issue #806), and the narrowly configured native ChatGPT
  subscription provider. Provider selection remains with the reviewed host
  adapters. There is no
  registry for arbitrary third-party providers — new hosted providers are
  reviewed adapters, not renderer-defined config.
- **Not a hosted model gateway or general OAuth broker.** The package does not
  proxy ChatGPT subscription calls through grida.co or mint hosted provider
  tokens. Its one refreshable OAuth session is the optional, host-configured
  native ChatGPT provider described below; auth routes remain private to the
  native host and expose only secret-free status.
- **Not a billing or entitlement engine.** Media adapters preserve operation
  receipts and reported usage; metering, pricing, plan gates and invoicing live
  outside this package.
- **Not a chat runtime.** Native hosts own chat execution, scheduling, sessions,
  prompts and tool assembly. Historical TypeScript execution is source-only
  regression evidence, never a shipped fallback.
- **Not a UI framework.** The protocol retains AI-SDK UI-message frame types;
  rendering, transcript state and history navigation are the client's job.
- **Not a Desktop bridge package.** `@grida/daemon/transport` +
  `@grida/agent/transport` own the daemon HTTP seam. Electron-specific
  window, dialog, shell, host-app, and file-path capabilities stay in
  Desktop's bridge contract.
- **Not the host layer.** The loopback perimeter, daemon discovery, and
  the host capability routes (files, recents, workspaces, the secrets
  store) live in `@grida/daemon` (#927). A non-AI host capability never
  lands here.
- **Not a chat-history migration service.** Historical session, message and part
  row types remain in `session/rows.ts` for explicit archive readers. Importing
  those contracts opens no store and starts no recovery or queued work.

## Package Docs

Package docs cover the current host contracts and the proposed Rust core.

The [Agent Features catalog](https://github.com/gridaco/grida/blob/main/docs/agent/features.md)
records current implementation coverage alongside the rebuilt product's feature
promises and scope.

- [Rust core proposal](./docs/rust-core-proposal.md) — proposed crate layout,
  dependency graph, and public contracts for the fresh agent implementation.
- [Native executable and headless host](./docs/rust-core-proposal.md#native-executable-and-headless-host)
  — the shared engine/server binary, unattended runs, and process-level testing
  required before Desktop integration.
- [Rust core pressure test](./docs/rust-core-pressure-test.md) — minimal-master
  and durable-session walkthroughs, Grida feature checks, and proposed commitments.
- [Tool-host contract](./docs/tool-host-contract.md) — concrete Rust/Electron
  ownership, shared native/MCP capabilities, endpoint identity, domain-owned results, and invocation recovery.
- [Configuration proposal](./docs/rust-config-proposal.md) — reviewed settings,
  conversational inspection and changes, and the minimal host-owned TOML surface.
- [Client protocol proposal](./docs/rust-client-protocol.md) — ACP-first clients,
  custom presentation, negotiated durable controls, and compatibility checks.
- [Lifecycle hooks](./docs/rust-core-proposal.md#configured-lifecycle-hooks) —
  configured checks and context contributions through existing execution contracts.
- [Native sandbox proposal](./docs/rust-sandbox-proposal.md) — concrete srt
  replacement, minimal launch contract, and native platform boundaries.
- [DaemonServer](../grida-daemon/docs/daemon-server.md) — lifecycle,
  ownership, and what hosts must provide (`@grida/daemon`).
- [HTTP access](../grida-daemon/docs/http-access.md) — Basic Auth, CORS, and
  Referer policy supplied by a host adapter (`@grida/daemon`).
- [Sandbox policy](./docs/sandbox-policy.md) — the composed sandbox intent
  (daemon frame + this tenant's AI upstream hosts).
- [ChatGPT subscription provider](./docs/chatgpt-subscription-provider.md) —
  host configuration, private OAuth routes, credential lifecycle, model
  mapping, provider-resolution behavior, and the active Desktop security
  binding.

The wider architecture lives in the working-group docs:

- [Desktop (WG)](../../docs/wg/desktop/index.md) — one host binding for
  the daemon, including renderer bridge, GRIDA-SEC-004, storage, and sandbox
  wrap details.
- [Agent system RFC](../../docs/wg/ai/agent/index.md) — the abstract
  contract this implements (protocol, locked tools, sessions, capability
  surface).
- [Grida bindings](../../docs/wg/ai/grida/index.md) — how the locked
  tools and built-in subagents land in Grida.

## Build & test

```sh
pnpm --filter @grida/agent build   # tsdown → dist/
pnpm --filter @grida/agent test    # vitest
```

`smoke:sessions:live` exercises the sessions store against a real SQLite
file — a manual smoke check, not part of `test`.

The native host excludes the provider credential tree from workspace, scratch and
attached-directory grants before structured filesystem hydration. The same
`ProtectedRoots` owner from `@grida/daemon/server` rechecks those roots before
backend I/O and revalidates pending or cached directory grants. An ancestor such
as the entire Grida home is refused too; ordinary workspace symlinks continue to
use the daemon filesystem's containment checks. These are application authority
checks, not protection against a hostile local process racing path mutations.

Tripo generation and rigging requests preserve their byte/base64 input schemas
and explicitly select `provider: "tripo" | "gg"`. The media host passes its existing memory-only GG session store and configured gateway origin
to the SDK. GG uploads use the SDK's exact signed Tripo S3 PUT authority and
hosted JSON result; no key, signed upload reference, or expiring output URL is
returned to the renderer. An expired scoped grant or insufficient credits
returns the existing actionable code without falling back to BYOK. Accepted
task identities remain visible in safe errors, including failures after the
provider accepted a task. Neither adapter retries a paid operation.
