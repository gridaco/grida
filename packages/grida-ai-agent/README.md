# `@grida/agent`

Grida's AI agent system in one package. Private, `workspace:*`, in
active development. The **agent tenant** of
[`@grida/daemon`](../grida-daemon/README.md) (issue #927): the daemon
owns the loopback perimeter and the host capability routes; this package
depends on it and mounts everything AI behind it.

It owns three agent-system concerns:

- **The agent tenant.** `createAgentTenant` registers the AI route
  groups (`/agent`, `/events`, `/sessions`, `/secrets`, `/providers`,
  `/images`, `/video`) through the daemon's `DaemonTenant` seam, and
  owns their state — the run loop, chat sessions (SQLite), BYOK
  provider resolution, endpoint configs. `createAgentDaemon` is the
  composed server hosts actually run. Node-only.
- **The Grida agent.** Runtime-agnostic agent definition: system-prompt
  composition (`composeSystemPrompt` + skills), model tiers, and the
  AI-SDK UI-message stream contract. No Node, no DOM.
- **Tool primitives.** Storage-agnostic [`fs`](./src/fs/README.md)
  (virtual filesystem + AI-SDK file tools) and
  [`todos`](./src/todos/README.md) (live plan + `todo_write`). Each has
  its own README.

## Exports

Subpath exports gate platform reach: a bare `import "@grida/agent"`
stays browser-safe, and the Node-only entry points are quarantined
behind their own subpaths so they never pull `node:*` into a client
bundle.

| Subpath              | What                                                                                                                                                           | Platform |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `.`                  | protocol contracts (BYOK provider metadata, handshake, run, stream DTOs), `createAgent`, `composeSystemPrompt`, `createToolset`, tier types, session-row types | neutral  |
| `./tiers`            | model tier constants (`AGENT_TIERS`, `AGENT_DEFAULT_TIER`)                                                                                                     | neutral  |
| `./fs`               | virtual fs + file tools ([README](./src/fs/README.md))                                                                                                         | neutral  |
| `./fs/backends/opfs` | browser OPFS backend                                                                                                                                           | browser  |
| `./todos`            | plan store + `todo_write` ([README](./src/todos/README.md))                                                                                                    | neutral  |
| `./server`           | `createAgentTenant` + `createAgentDaemon` (the composed daemon), daemon re-exports                                                                             | Node     |
| `./sandbox`          | composed sandbox policy (`buildAgentDaemonSandboxPolicy` — daemon frame + AI upstream hosts)                                                                   | Node     |
| `./transport`        | `AgentTransport` namespace — extends `DaemonTransport.Client` with the agent tenant's routes                                                                   | neutral  |

The Node fs backend (`NodeFsBackend`) is internal + test-only — it is not a
public subpath; workspace bindings use it in-process.

## Provider HTTP

Node hosts may pass `provider_http` to `createAgentTenant` or
`createAgentDaemon` when provider traffic cannot use the process-global
`fetch`. The value has two required operations:

- `request` executes provider-owned traffic, including authenticated text and
  media calls, hosted-provider calls, configured-endpoint inference and health
  checks, and media job submit/poll/result requests.
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

## Anti-goals

The perimeter that keeps this package small. A feature request that
crosses one of these is the wrong tool, not a missing feature.

- **Not a general model-provider router.** Provider selection is
  isolated to the node-only `providers/` layer: the BYOK key slots
  (OpenRouter → AI Gateway) plus ONE generalized OpenAI-compatible
  endpoint type (`{base_url, optional key, registered models}` — Ollama
  is the preset; issue #806). The agent + runtime core never import
  selection; they receive a resolved `ModelFactory`. There is no
  registry for arbitrary third-party providers — new hosted providers are
  new BYOK slots, not config.
- **Not a hosted model gateway.** The package does not proxy model calls
  through grida.co, own OAuth sessions, or mint hosted provider tokens.
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
