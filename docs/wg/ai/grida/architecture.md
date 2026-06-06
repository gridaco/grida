---
title: Architecture — Grida's agent system implementation
description: Exposed contract of Grida's local agent system, the package boundary, and the tests that pin it during refactor.
keywords:
  [grida, agent, architecture, blueprint, agent-host, contract, blackbox]
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
binds it into `@grida/agent`, Desktop, and the editor bridge.

V1 scope is deliberately narrow: local `AgentHost` plus BYOK model providers.
`grida-cloud` is deferred and documented separately as a future hosted provider
that must fit this contract instead of shaping it.

**Source-of-truth rule.** Every agent feature lands in the core
(`@grida/agent`) and is reachable from the **`grida-agent` CLI** first; Desktop
and the editor UI are thin wrappers over the same `AgentHost` + `AgentTransport`
surface. A capability that exists in a host but not the CLI is a bug — it means
behavior leaked out of the core into a shell. The CLI is also what keeps the
core testable without Electron: the lifecycle ops (`run`, `compact`, `rewind`,
`fork`) are exercised end to end over HTTP in
`packages/grida-ai-agent/src/cli.test.ts`.

Sibling docs:

- [Agent RFC](../agent/index.md) — the contract this realizes.
- [Grida bindings](./index.md) — naming map, backends, built-in subagents.
- [Desktop](../../desktop/index.md) — the desktop host landing.
- [Deferred Grida Cloud Agent Provider](../../platform/grida-cloud-agent-runtime.md)
  — preserved design notes for the removed hosted-provider prototype.
- [Phase 3 agent contract cleanup](./agent-contract-cleanup.md) — seam
  decisions and refused alternatives after the BYOK-only cleanup.

## The Three Orchestrators

```
@grida/agent/server  ──HTTP──▶  editor/lib/agent-chat  ──React──▶  scaffolds/
       ▲ AgentHost                         transport/hooks/display              UI panels
       │
Host supervisor / adapter  (spawns the host and wires platform capabilities)
```

| Orchestrator      | Where                                              | Lifetime                  |
| ----------------- | -------------------------------------------------- | ------------------------- |
| `AgentHost`       | `@grida/agent/server` (`packages/grida-ai-agent/`) | Agent host process        |
| Host supervisor   | Host app code                                      | Host process              |
| Desktop chat seam | `editor/lib/agent-chat/`                           | Per renderer (per window) |

These layers are where coordination logic belongs. Everything else is a small
collaborator with one job.

## Exposed Contract

Anything not listed here is internal and can move.

### 1. `AgentHost` — Lifecycle Only

```ts
import { AgentHost, type AgentHostOptions } from "@grida/agent/server";

export class AgentHost {
  constructor(opts: AgentHostOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type AgentHostOptions = {
  password: string;
  userDataPath: string;
  httpAccess: AgentServerHttpAccess;
  capabilities?: Partial<AgentServerCapabilities>;
  hostname?: string;
  port?: number;
};
```

Lifecycle is the entire public class surface. Everything else is reached over
HTTP. The class does not expose `sessions`, `providers`, `runtime`, or storage
collaborators.

### 2. HTTP Wire

The renderer-facing surface is gated by
[GRIDA-SEC-004](https://github.com/gridaco/grida/blob/main/SECURITY.md#grida-sec-004--desktop-agent-host-trust-boundary):
per-spawn Basic Auth, `Referer`, and `Origin`.

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

Typed host bridges are host-owned adapters around the `@grida/agent` protocol
and client types. The agent package supplies the HTTP wire contract; each host
decides how renderer code receives an authorized client capability.

```ts
import { AgentTransport } from "@grida/agent/transport";

export type HostAgentBridge = {
  client: AgentTransport.Client;
  capabilities: AgentServerCapabilities;
};
```

Desktop's concrete bridge shape is documented in
[desktop/renderer-bridge](../../desktop/renderer-bridge.md). It is not an agent
package export.

## Package Map

| Package            | Path                        | Owns                                                                                                                |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@grida/agent`     | `packages/grida-ai-agent/`  | `AgentHost`, runtime, sessions, BYOK providers, workspaces, prompts, tools, HTTP routes, and sandbox policy intent. |
| `@grida/ai-models` | `packages/grida-ai-models/` | Model catalog + pricing table. Imported for tier/model metadata.                                                    |

Current layer shape:

```text
packages/grida-ai-agent/src/
├── index.ts                 # curated neutral root surface
├── server.ts                # Node/server exports
├── transport.ts             # AgentTransport namespace
├── agent-host.ts            # lifecycle owner
├── protocol/                # provider ids, handshake, run, wire vocabulary
├── agent/                   # createAgent + prompts
├── tools/                   # createToolset + run_command + tool names
├── providers/               # BYOK resolver + upstream factories
├── runtime/                 # AgentRuntime, runAgent, SSE registry, message-view
├── session/                 # rows, SQLite store, recorder, titler, compaction, compactor
├── skills/                  # discovery, project instructions, the `skill` tool
├── auth/                    # auth.json persistence for local credentials
├── http/                    # routes and guards
├── workspaces/              # opened workspace registry + guarded fs
├── fs/                      # fs contracts/backends
├── todos/                   # todo contracts/backends
└── sandbox/                 # host sandbox policy intent
```

Published subpaths are curated:

```jsonc
{
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
```

## Anti-goals

- No hosted model gateway in V1.
- No OAuth/auth client in V1.
- No billing or entitlement engine in V1.
- No general provider router.
- No window/UX framework — hosts render; `AgentHost` stores and runs.
- No plugin/extension registry — tools and capabilities are fixed by the RFC.
- No free `process.spawn` — shell goes through the host command policy.

## Reading Order

1. This doc.
2. [agent/foundations.md](../agent/foundations.md).
3. [agent/tools.md](../agent/tools.md) and [agent/persistency.md](../agent/persistency.md).
4. [tools-fundamentals.md](./tools-fundamentals.md).
5. [desktop/process-model.md](../../desktop/process-model.md).
6. [GRIDA-SEC-004](https://github.com/gridaco/grida/blob/main/SECURITY.md#grida-sec-004--desktop-agent-host-trust-boundary).

## See Also

- [Agent RFC](../agent/index.md)
- [Grida bindings](./index.md)
- [Desktop](../../desktop/index.md)
- [Deferred Grida Cloud Agent Provider](../../platform/grida-cloud-agent-runtime.md)
- [Built-in subagents](./agents-builtin.md)
