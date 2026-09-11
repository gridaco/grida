# `@grida/agent`

Grida's configured agent and its application runtime. Private, `workspace:*`,
in active development. The **agent tenant** of
[`@grida/daemon`](../grida-daemon/README.md) (issue #927): the daemon
owns the loopback perimeter and the host capability routes; this package
depends on it and currently mounts the agent and media routes behind it.

Shared model operations belong to [`@grida/ai`](../grida-ai/README.md).
This package owns Grida's prompts, installed tools and skills, model defaults,
chat sessions, workspace bindings, and external-agent integration. Runtime-neutral
code can still be Grida-specific: `createAgent` remains here because it assembles
the Grida agent. Reusable agent primitives may move to `@grida/ai` once their
contracts work without this application policy; a hypothetical future caller is
not a reason to extract them.

It owns three agent-system concerns:

- **The agent tenant.** `createAgentTenant` registers the AI route
  groups (`/agent`, `/events`, `/sessions`, `/secrets`, `/providers`,
  `/images`, `/video`, `/three-d`, `/model-generation`, `/audio/music`, `/audio/sound-effects`,
  `/audio/text-to-speech`, and optional native-provider auth)
  through the daemon's `DaemonTenant` seam, and
  owns their state — the run loop, chat sessions (SQLite), BYOK
  and native-provider resolution, endpoint configs. `createAgentDaemon` is the
  composed server hosts actually run. Node-only.
- **The Grida agent.** Runtime-agnostic agent definition: system-prompt
  composition (`composeSystemPrompt` + skills), model tiers, and the
  AI-SDK UI-message stream contract. No Node, no DOM.
- **Tool primitives.** Storage-agnostic [`fs`](./src/fs/README.md)
  (virtual filesystem + AI-SDK file tools) and
  [`todos`](./src/todos/README.md) (live plan + `todo_write`), plus the
  host-rendered artifact [`surface`](./src/surface/index.ts) contract.

## Exports

Subpath exports gate platform reach: a bare `import "@grida/agent"`
stays browser-safe, and the Node-only entry points are quarantined
behind their own subpaths so they never pull `node:*` into a client
bundle.

| Subpath              | What                                                                                                                                                                                  | Platform |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `.`                  | protocol contracts (native/BYOK provider metadata and safe status, handshake, run, stream DTOs), `createAgent`, `composeSystemPrompt`, `createToolset`, tier types, session-row types | neutral  |
| `./tiers`            | model tier constants (`AGENT_TIERS`, `AGENT_DEFAULT_TIER`)                                                                                                                            | neutral  |
| `./fs`               | virtual fs + file tools ([README](./src/fs/README.md))                                                                                                                                | neutral  |
| `./fs/backends/opfs` | browser OPFS backend                                                                                                                                                                  | browser  |
| `./todos`            | plan store + `todo_write` ([README](./src/todos/README.md))                                                                                                                           | neutral  |
| `./surface`          | server-executed artifact-surface tools, turn snapshot, and browser observer                                                                                                           | neutral  |
| `./server`           | `createAgentTenant` + `createAgentDaemon` (the composed daemon), daemon re-exports                                                                                                    | Node     |
| `./media-server`     | `createMediaTenant` + `createMediaDaemon`, media options and provider transport type; no chat startup                                                                                 | Node     |
| `./sandbox`          | composed sandbox policy (`buildAgentDaemonSandboxPolicy` — daemon frame + AI upstream hosts)                                                                                          | Node     |
| `./transport`        | `AgentTransport` namespace — extends `DaemonTransport.Client` with the agent tenant's routes                                                                                          | neutral  |

The Node fs backend (`NodeFsBackend`) is internal + test-only — it is not a
public subpath; workspace bindings use it in-process.

## Shared media operations

The image HTTP route and `generate_image` tool use `@grida/ai`'s `ImageClient`.
This package adapts shared native provider custody and provider transport, chooses the agent's
default model, and explicitly selects the existing automatic provider policy.
The SDK resolves compatibility and executes the selected provider. The host
reads reference files and persists returned bytes to media storage or session
scratch.

The service policy comes from `@grida/ai-models/grida`, which joins Grida membership,
legacy status, tiers, request presets and optional recommendations to the neutral
`@grida/ai-models` facts. The shared SDK retains its Grida defaults and owns the
refresh store, using the service entry's seed and schema-1 parser. The image and
video routes and chat runtime share that store; audio and 3D retain their bundled
catalogs. The optional image default
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
it does not receive BYOK keys. The SDK validates the two bundled Lyria models,
text/seed input and a bounded MP3 response. The route converts bytes to its
existing wire shape, derives the canonical model filename, and adds an optional
root-level storage receipt. GG refresh remains with the host. Music, sound
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

The model-generation route uses `TripoClient` for direct Tripo BYOK. Model
identity (H3.1, P1 or P2 Preview) is separate from the explicit model-generation
feature and its text, image or named multiview input. `AgentTransport.Client`'s
`modelGeneration.generate` accepts the SDK JSON input, with base64 in image
`data` fields, under a 48 MiB total request limit. The SDK validates inputs
before credential access and returns an uncompressed, self-contained GLB.
The host returns GLB bytes, a safe task ID and reported Tripo credits, plus
an optional media receipt. Tripo account credit failures remain attributed to
Tripo. Accepted work is never resubmitted after a timeout or download failure.
Rigging, remeshing and other processing operations need distinct feature
contracts; they are not advertised by this generation route. The existing
`three_d` host capability gates both 3D generation route groups.

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

The full `createAgentDaemon` defaults and routes remain unchanged. Its media
routes and chat runtime share one private media owner, with one GG memory store,
catalogue and provider transport per launch. Explicitly disabling both `agent`
and `sessions` also skips chat allocation and scratch sweeping in the legacy
entry, but that entry still imports chat modules. Use `media-server` for module
isolation. Choosing one composition per launch avoids duplicate credential
stores or routes; there is no fallback from failed chat startup to media mode.
This is startup independence within the existing package, not a separate
installation or a runtime plugin system.

Native host setup can import `defaultScratchBase` and `prepareScratchAuthority`
from `@grida/agent/sandbox`, and `CHATGPT_AUTH_ROUTE_PATHS` and the
`ChatGptAuthStart` wire type from the neutral root. Their existing `server`
exports remain compatible. Route names and wire types grant no native auth
authority; the host still owns that ceremony.

The daemon's `SecretsStore` now delegates BYOK persistence to the shared
native TOML owner (GRIDA-SEC-014). The native host supplies `provider_home`;
media and agent code continue to receive only a key reader. The standalone
`grida-agent` host uses the canonical Grida home by default; its explicit
`GRIDA_AGENT_USER_DATA` override also isolates provider custody under that
path. ChatGPT OAuth remains in the daemon's separate `auth.json` and GG stays
in memory. Directory references and finite-command scopes protect both the
agent state root and the shared provider directory.

## Provider HTTP

Node hosts may pass `provider_http` to `createAgentTenant` or
`createAgentDaemon` when provider traffic cannot use the process-global
`fetch`. The value has two required operations:

- `request` executes provider-owned traffic, including authenticated text and
  media calls, OAuth exchange/refresh for configured native providers,
  hosted-provider calls, configured-endpoint inference and health checks, and
  media job submit/poll/result requests.
- `download` executes credential-free provider result/asset downloads,
  including URL inputs that the AI SDK must lower to bytes before a model
  call. The host authorizes each concrete origin; the contract does not grant
  arbitrary public-web access.

Omitting `provider_http` preserves ambient `globalThis.fetch` only for provider
`request` operations needed by standalone/CLI hosts. Remote `download`
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
its authenticated, same-origin content endpoint. Vercel Gateway video accepts
only inline `data:` results or its exact configured Gateway origin; an
arbitrary result origin fails with `unsupported_untrusted_result_origin`, and
an exact remote origin still requires the host download transport. Vercel
Gateway image responses are base64 strings on the provider request lane and
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

GPT Image 2.5 Flare and Sunburst bind Vercel, OpenRouter, and fal. Vercel and fal
have verified native-background controls; OpenRouter's published endpoint schema
does not expose transparency. Reference-conditioned generation is available on
OpenRouter and fal; transparent edits require fal because Vercel reference
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
The outbound default is `"allowlisted"`, preserving CLI behavior.

## Finite command execution

`run_command` is exposed only when a host injects `shell_executor`. Each call
receives the validated command plus an immutable scope naming the current
workspace, optional own-session scratch, shared scratch base, and protected
read roots. The executor is the authority boundary: Desktop sends the request
to Electron main and creates a fresh OS-sandbox profile for that finite process.
The boolean `sandbox_enforced` attests only the coarse process tree (used by the
external-agent disposition); it cannot expose raw shell by itself.

The tool abort signal is part of the executor contract. Desktop acknowledges an
aborted command only after the worker has returned and its per-command
authority has been cleaned up; the runtime keeps the owning session occupied
until that acknowledgement and the aborted model pump settle.

A standalone host that deliberately accepts ambient filesystem authority may
set `allow_unsandboxed_shell`; this injects the package's raw runner and logs
the weaker posture. Omission of both options withholds the tool.

## Anti-goals

The perimeter that keeps this package small. A feature request that
crosses one of these is the wrong tool, not a missing feature.

- **Not a general model-provider router.** Provider selection is
  isolated to the node-only `providers/` layer: the BYOK key slots
  (OpenRouter → AI Gateway) plus ONE generalized OpenAI-compatible
  endpoint type (`{base_url, optional key, registered models}` — Ollama
  is the preset; issue #806), and the narrowly configured native ChatGPT
  subscription provider. The agent + runtime core never import
  selection; they receive a resolved `ModelFactory`. There is no
  registry for arbitrary third-party providers — new hosted providers are
  reviewed adapters, not renderer-defined config.
- **Not a hosted model gateway or general OAuth broker.** The package does not
  proxy ChatGPT subscription calls through grida.co or mint hosted provider
  tokens. Its one refreshable OAuth session is the optional, host-configured
  native ChatGPT provider described below; auth routes remain private to the
  native host and expose only secret-free status.
- **Not a billing or entitlement engine.** The package forwards per-step
  usage via a hook and propagates a transaction id; metering, pricing,
  plan gates, and invoicing live outside this package.
- **Not a multi-agent orchestration graph.** One agent loop. `skills`
  layer prompt blocks onto the core; they are not sub-agents, and there
  is no planner/router-of-agents.
- **Not a UI framework.** The agent streams AI-SDK UI-message frames;
  rendering, transcript state, and history navigation are the client's job.
- **Not a Desktop bridge package.** `@grida/daemon/transport` +
  `@grida/agent/transport` own the daemon HTTP seam. Electron-specific
  window, dialog, shell, host-app, and file-path capabilities stay in
  Desktop's bridge contract.
- **Not the host layer.** The loopback perimeter, daemon discovery, and
  the host capability routes (files, recents, workspaces, the secrets
  store) live in `@grida/daemon` (#927). A non-AI host capability never
  lands here.
- **Not a private chat-history IR.** The three session tables
  (session → messages → parts, in `session/rows.ts`) **are** the
  contract — hosts read and render them directly. There is no hidden
  intermediate representation rebuilt on load.

## Agent-provider class (experimental — issue #813)

A **second provider class**, distinct from the model-provider kinds above: an
**external agent owns the loop**. Grida acts as an
[ACP](https://agentclientprotocol.com) **consumer** driving Claude on the
user's own subscription (`src/agent-provider/`, spawning the ACP-team bridge
`@agentclientprotocol/claude-agent-acp` over stdio). The runtime branches on
this kind _before_ provider resolution and streams from the external agent, so
no `ModelFactory` is ever called — it does **not** make the package a
model-provider router (the anti-goal above stands). Synthetic `claude-acp/*`
model ids (`agent-provider/types.ts`) select it; continuity rides ACP
`session/resume`. Because that subprocess owns its own tools and network stack,
the construction-time `external_agent_execution` disposition is explicit:
`"enabled"` is host-authorized execution with no containment claim (the
CLI's explicit choice), `"sandboxed"` requires `sandbox_enforced: true`, and
`"disabled"` withholds the capability and is the omission default.
`allow_unsandboxed_shell` governs only Grida's locked shell and does not affect
this independent process authority.

This is a spike, and the class **forks every host feature** (each one needs an
agent-provider branch alongside the model-provider one). Whether it earns that
permanent cost is an open decision — see
[acp-provider.md](../../docs/wg/ai/agent/acp-provider.md). User-outcome
("jobs to be done") coverage is the spec: deterministic tests drive a fake ACP
agent (`testing/fake-acp-agent.ts`, `agent-provider/jtbd.test.ts`); the gated
`agent-provider/run.live.test.ts` proves the real bridge.

## Package Docs

Package docs are host-agnostic and describe the contracts exported by
`@grida/agent`:

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
