---
title: Architecture — Grida's agent system implementation
description: Exposed contract of Grida's local agent system, the package boundary, and the tests that pin it during refactor.
keywords:
  [grida, agent, architecture, blueprint, daemon, tenant, contract, blackbox]
format: md
tags:
  - internal
  - wg
  - ai
  - architecture
---

# Architecture — Grida's Agent System Implementation

This is the exposed contract for Grida's local agent system. The protocol
itself is [the agent RFC](../agent/index.md); this page records how Grida
binds it into `@grida/daemon`, `@grida/agent`, Desktop, and the editor bridge.

The local daemon runs BYOK model providers and — for signed-in users —
[Grida Gateway (GG)](../../platform/hosted-ai.md), the first-party hosted
provider. GG fit this contract instead of shaping it: it supplies model
capacity only (the `gg` provider kind), while the agent loop stays local.

**Host/tenant split (#927).** The local privileged process is a general
**daemon** (`@grida/daemon`): the loopback HTTP server, the GRIDA-SEC-004
perimeter, and the host capability route groups (files, recents, workspaces,
the secrets store). The AI agent is one **tenant** of that daemon
(`@grida/agent`): it registers the AI route groups (`agent`, `sessions`,
`secrets`, `providers`, `images`, `video`) through the typed `DaemonTenant`
seam. Dependency direction is one-way — the tenant imports the daemon; the
daemon knows no tenant. A contributor adding a non-AI host capability (a file
server, a viewer backend) targets `@grida/daemon` and never touches an AI
package.

**Source-of-truth rule.** Every agent feature lands in the core
(`@grida/agent`) and is reachable from the **`grida-agent` CLI** first; Desktop
and the editor UI are thin wrappers over the same composed daemon +
`AgentTransport` surface. A capability that exists in a host but not the CLI is
a bug — it means behavior leaked out of the core into a shell. The CLI is also
what keeps the core testable without Electron: the lifecycle ops (`run`,
`compact`, `rewind`, `fork`) are exercised end to end over HTTP in
`packages/grida-ai-agent/src/cli.test.ts`.

Sibling docs:

- [Agent RFC](../agent/index.md) — the contract this realizes.
- [Grida bindings](./index.md) — naming map, backends, built-in subagents.
- [Desktop](../../desktop/index.md) — the desktop host landing.
- [Grida Gateway (GG)](../../platform/hosted-ai.md)
  — the shipped hosted model-capacity provider; the agent loop stays local.
- [Phase 3 agent contract cleanup](./agent-contract-cleanup.md) — seam
  decisions and refused alternatives after the BYOK-only cleanup.

## The Three Orchestrators

```
@grida/daemon (server frame) + @grida/agent (tenant)
       ▲ DaemonServer          ──HTTP──▶  editor/lib/agent-chat  ──React──▶  scaffolds/
       │   composed by createAgentDaemon           transport/hooks/display        UI panels
Host supervisor / adapter  (spawns the daemon and wires platform capabilities)
```

| Orchestrator      | Where                                              | Lifetime                  |
| ----------------- | -------------------------------------------------- | ------------------------- |
| `DaemonServer`    | `@grida/daemon/server` (`packages/grida-daemon/`)  | Daemon process            |
| Agent tenant      | `@grida/agent/server` (`packages/grida-ai-agent/`) | Daemon process (mounted)  |
| Host supervisor   | Host app code                                      | Host process              |
| Desktop chat seam | `editor/lib/agent-chat/`                           | Per renderer (per window) |

These layers are where coordination logic belongs. Everything else is a small
collaborator with one job.

## Exposed Contract

Anything not listed here is internal and can move.

### 1. `DaemonServer` — Lifecycle Only

```ts
import { DaemonServer, type DaemonServerOptions } from "@grida/daemon/server";
import { createAgentDaemon } from "@grida/agent/server";

export class DaemonServer {
  constructor(opts: DaemonServerOptions); // opts include the static tenant list
  start(): Promise<void>;
  stop(): Promise<void>;
}

// What hosts actually run: the daemon frame with the agent tenant mounted.
export function createAgentDaemon(opts: AgentDaemonOptions): DaemonServer;
```

Lifecycle is the entire public class surface. Everything else is reached over
HTTP. The class does not expose `sessions`, `providers`, `runtime`, or storage
collaborators. The tenant seam (`DaemonTenant`: `register(app, services)` →
`{ capabilities, drain, cleanup }`, plus the declared `sse_query_token_paths`)
is a static, typed list supplied at construction — deliberately not a plugin
registry.

### 2. HTTP Wire

The renderer-facing surface is gated by
[GRIDA-SEC-004](https://github.com/gridaco/grida/blob/main/SECURITY.md#grida-sec-004--desktop-daemon-trust-boundary):
per-spawn Basic Auth, `Referer`, and `Origin` — owned by `@grida/daemon`;
tenant routes mount behind the same guards.

| Method | Path                       | Body / Query                                                    | Response                                                                             |
| ------ | -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| POST   | `/handshake`               | —                                                               | protocol + capabilities                                                              |
| POST   | `/agent/run`               | `AgentRunInput`                                                 | SSE stream of `UIMessageChunk`; first frame is the `grida-session` event (sessionId) |
| GET    | `/agent/stream/:sessionId` | —                                                               | SSE replay-from-0 + live tail; 404 if no live run                                    |
| POST   | `/agent/abort`             | `{ sessionId }`                                                 | `{ ok: true }`                                                                       |
| GET    | `/sessions`                | query: `agent? workspaceId? q? includeArchived? cursor? limit?` | `{ items: ChatSessionRow[], nextCursor }`                                            |
| GET    | `/sessions/:id`            | —                                                               | `ChatSessionRow` or 404                                                              |
| POST   | `/sessions`                | `CreateSessionOptions`                                          | `ChatSessionRow`                                                                     |
| PATCH  | `/sessions/:id`            | `PatchSessionOptions`                                           | `ChatSessionRow`                                                                     |
| DELETE | `/sessions/:id`            | —                                                               | `{ ok: true }`                                                                       |
| GET    | `/sessions/:id/messages`   | —                                                               | `ChatMessageWithParts[]`                                                             |
| POST   | `/sessions/:id/rewind`     | `{ fromMessageId, restore? }`                                   | `RewindResult` (or `{ ok, restored, session }`)                                      |
| POST   | `/sessions/:id/fork`       | `{ fromMessageId, metadata? }`                                  | `ChatSessionRow` (the new forked session)                                            |
| POST   | `/sessions/:id/compact`    | —                                                               | `CompactionResult`                                                                   |
| POST   | `/secrets/has`             | `{ providerId }`                                                | `{ has: boolean }`                                                                   |
| POST   | `/secrets/set`             | `{ providerId, key }`                                           | `{ ok: true }`                                                                       |
| POST   | `/secrets/delete`          | `{ providerId }`                                                | `{ ok: true }`                                                                       |
| POST   | `/workspaces/open`         | `{ rootPath }`                                                  | `Workspace`                                                                          |
| GET    | `/workspaces`              | —                                                               | `Workspace[]`                                                                        |

There is intentionally no `/secrets/get`, no `/auth/*`, and no
`/entitlements/*` in V1.

### 3. Provider Contract

V1 provider resolution is BYOK-only:

1. `openrouter`
2. `vercel`
3. unavailable (`provider_down`)

`AgentRunOptions.providerId` accepts only `ByokProviderId`. The package root
exports `BYOK_PROVIDER_METADATA`, `BYOK_PROVIDER_IDS`, and `ByokProviderId`;
it does not export `grida-cloud` provider constants. The metadata array order
drives resolver precedence and Desktop settings labels. Sandbox network hosts
stay in the sandbox policy layer. A future hosted provider must return the same
kind of model factory the runtime already consumes.

### 4. Host Client Bridge

Typed host bridges are host-owned adapters around the daemon + agent protocol
and client types. `@grida/daemon/transport` owns the seam primitives (signing,
fetch/SSE plumbing, errors) and the daemon route methods;
`@grida/agent/transport`'s `AgentTransport.Client` extends that client with the
tenant groups. Each host decides how renderer code receives an authorized
client capability.

```ts
import { AgentTransport } from "@grida/agent/transport";

export type HostAgentBridge = {
  client: AgentTransport.Client; // extends DaemonTransport.Client
  capabilities: DaemonCapabilities;
};
```

Desktop's concrete bridge shape is documented in
[desktop/renderer-bridge](../../desktop/renderer-bridge.md). It is not an agent
package export.

## Package Map

| Package            | Path                        | Owns                                                                                                                                 |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@grida/daemon`    | `packages/grida-daemon/`    | `DaemonServer`, the GRIDA-SEC-004 perimeter, daemon discovery, files/recents/workspaces, secrets store, shell runner, sandbox frame. |
| `@grida/agent`     | `packages/grida-ai-agent/`  | The agent tenant: runtime, sessions, BYOK providers, prompts, tools, the AI route groups, CLI, and the AI upstream sandbox hosts.    |
| `@grida/ai-models` | `packages/grida-ai-models/` | Model catalog + pricing table. Imported for tier/model metadata.                                                                     |

Current layer shape:

```text
packages/grida-daemon/src/
├── index.ts                 # curated neutral root surface (handshake + resource DTOs)
├── server.ts                # Node/server exports (DaemonServer, seam, tenant toolkit)
├── transport.ts             # DaemonTransport namespace (signing, SSE, daemon routes)
├── daemon-server.ts         # lifecycle owner
├── daemon.ts                # discovery contract (WG daemon.md, #798)
├── protocol/                # handshake + local-resource DTOs
├── http/                    # perimeter guards, daemon routes, the DaemonTenant seam
├── workspaces/              # opened workspace registry + guarded fs
├── files/                   # file registry + recents
├── auth/ + secrets.ts       # auth.json persistence + BYOK key store
├── shell/                   # command runner (structural gates)
└── sandbox/                 # sandbox policy frame (AI-free)

packages/grida-ai-agent/src/
├── index.ts                 # curated neutral root surface
├── server.ts                # createAgentTenant + createAgentDaemon
├── transport.ts             # AgentTransport (extends DaemonTransport.Client)
├── protocol/                # provider ids, run, wire vocabulary
├── agent/                   # createAgent + prompts
├── tools/                   # createToolset + run_command + tool names
├── providers/               # BYOK resolver + upstream factories
├── runtime/                 # AgentRuntime, runAgent, SSE registry, message-view
├── session/                 # rows, SQLite store, recorder, titler, compaction, compactor
├── skills/                  # discovery, project instructions, the `skill` tool
├── http/routes/             # the AI route groups (agent, sessions, secrets, providers, images, video)
├── fs/                      # fs contracts/backends
├── todos/                   # todo contracts/backends
└── sandbox/                 # AI upstream hosts composed onto the daemon frame
```

Published subpaths are curated:

```jsonc
{
  // @grida/daemon
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/server.js",
    "./sandbox": "./dist/sandbox/index.js",
    "./transport": "./dist/transport.js",
  },
}
```

```jsonc
{
  // @grida/agent
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/server.js",
    "./sandbox": "./dist/sandbox/index.js",
    "./transport": "./dist/transport.js",
    "./tiers": "./dist/tiers.js",
    "./fs": "./dist/fs/index.js",
    "./fs/backends/opfs": "./dist/fs/backends/opfs.js",
    "./todos": "./dist/todos/index.js",
  },
}
```

## Test Pins

Behavioral tests pin the exposed contract. The internals may move freely as long
as these stay green.

```ts
describe("public API", () => {
  it("exports BYOK provider ids but no hosted provider id");
  it("exports session row types and wire chunk vocabulary from the root");
  it("pins server, transport, sandbox, fs, todos, and tiers subpaths");
});

describe("handshake", () => {
  it("does not advertise auth or entitlements in V1");
});

describe("provider resolution", () => {
  it("prefers OpenRouter BYOK over Vercel BYOK");
  it("falls back to Vercel BYOK");
  it("throws provider_down when no BYOK key is present");
  it("validates explicit BYOK provider ids");
});

describe("HTTP perimeter", () => {
  it("rejects requests without Basic Auth");
  it("rejects requests with wrong Referer / Origin");
  it("never exposes a secrets.get route");
});

describe("daemon/tenant seam (#927)", () => {
  it("a bare daemon (no tenants) serves only its own capabilities");
  it("stop() drains tenant work BEFORE tenant cleanup");
  it("@grida/daemon declares and imports nothing AI-specific");
  it(
    "the composed agent-daemon keeps wire parity (handshake, query-token carriage)"
  );
});
```

## Anti-goals

- No hosted model gateway in V1.
- No OAuth/auth client in V1.
- No billing or entitlement engine in V1.
- No general provider router.
- No window/UX framework — hosts render; the daemon stores and runs.
- No plugin/extension registry — tools and capabilities are fixed by the RFC,
  and the daemon's tenant list is a static typed list, not dynamic discovery.
- No free `process.spawn` — shell goes through the host command policy.

## Reading Order

1. This doc.
2. [agent/foundations.md](../agent/foundations.md).
3. [agent/tools.md](../agent/tools.md) and [agent/persistency.md](../agent/persistency.md).
4. [tools-fundamentals.md](./tools-fundamentals.md).
5. [desktop/process-model.md](../../desktop/process-model.md).
6. [GRIDA-SEC-004](https://github.com/gridaco/grida/blob/main/SECURITY.md#grida-sec-004--desktop-daemon-trust-boundary).

## See Also

- [Agent RFC](../agent/index.md)
- [Grida bindings](./index.md)
- [Desktop](../../desktop/index.md)
- [Grida Gateway (GG)](../../platform/hosted-ai.md)
- [Built-in subagents](./agents-builtin.md)
