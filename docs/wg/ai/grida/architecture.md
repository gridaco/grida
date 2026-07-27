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

The experimental
[ChatGPT Subscription native provider](../agent/chatgpt-subscription-provider.md)
fits the same capacity seam: Grida still owns sessions, tools, approvals,
sandboxing, and the loop. It is not Codex ACP. Its adapter and local
`GRIDA-SEC-008` boundary are implemented, while the stable legal/support
contract with OpenAI remains an external release gate.

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
- [ChatGPT Subscription native provider](../agent/chatgpt-subscription-provider.md)
  — the golden contract for experimental subscription-backed native capacity;
  implemented locally and externally gated for stable release.
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

There is intentionally no `/secrets/get`, renderer-facing `/auth/*`, or
`/entitlements/*` in V1. A configured native host may use the authenticated,
sidecar-private `/auth/chatgpt/*` control routes for start, completion, cancel,
safe status, and sign-out. Those routes are deliberately absent from
`AgentTransport`; the renderer reaches only fixed, guarded host capabilities.

### 3. Provider Contract

Native providers supply model capacity to the same Grida-owned loop. BYOK, GG,
configured endpoint/local capacity, and the experimental ChatGPT Subscription
provider remain distinct provider-qualified surfaces; ACP is an external-agent
boundary, not a native provider.

Selection is durable session intent:

1. an explicit request/session provider wins;
2. an explicitly changed model is an intentional re-resolution request and
   may choose another compatible provider;
3. otherwise a persisted user or session provider remains sticky while the
   model is omitted or unchanged;
4. a fresh, unconfigured session uses a ready ChatGPT Subscription connection
   first;
5. otherwise text resolution preserves BYOK, then GG, then configured
   endpoint/local capacity;
6. provider failure never causes silent mid-turn failover.

The [ChatGPT Subscription provider specification](../agent/chatgpt-subscription-provider.md#provider-selection)
owns this ordering. Existing users keep their stored choice, and auxiliary
work such as titling, recovery, and compaction follows the session provider.

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
| `@grida/agent`     | `packages/grida-ai-agent/`  | The agent tenant: runtime, sessions, native providers, prompts, tools, the AI route groups, CLI, and the AI upstream sandbox hosts.  |
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
├── auth/ + secrets.ts       # auth.json persistence + provider secret store
├── shell/                   # command runner (structural gates)
└── sandbox/                 # sandbox policy frame (AI-free)

packages/grida-ai-agent/src/
├── index.ts                 # curated neutral root surface
├── server.ts                # createAgentTenant + createAgentDaemon
├── transport.ts             # AgentTransport (extends DaemonTransport.Client)
├── protocol/                # provider ids, run, wire vocabulary
├── agent/                   # createAgent + prompts
├── tools/                   # createToolset + run_command + tool names
├── providers/               # native-provider resolver + upstream factories
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
  it("keeps native-provider identities distinct from ACP");
  it("exports session row types and wire chunk vocabulary from the root");
  it("pins server, transport, sandbox, fs, todos, and tiers subpaths");
});

describe("handshake", () => {
  it("does not advertise auth or entitlements in V1");
});

describe("provider resolution", () => {
  it("honors an explicit provider");
  it("preserves a persisted provider choice");
  it("keeps provider identity attached to auxiliary work");
  it("never silently changes provider during a failed turn");
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

- No renderer-owned provider credentials or OAuth lifecycle.
- No native-provider shortcut through ACP.
- No billing or entitlement engine in V1.
- No model-name-only provider inference.
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
