# `@grida/agent`

Grida's AI agent system in one package. Private, `workspace:*`, in
active development.

It owns three agent-system concerns:

- **AgentHost core.** The `AgentHost` that wires the long-lived
  services behind the agent server HTTP perimeter — sessions, BYOK providers,
  workspaces, secrets, files, shell, and the agent run loop. This is the
  server lifecycle that a host may run headlessly. Node-only.
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
| `./server`           | `AgentHost` + server capability contracts                                                                                                                      | Node     |
| `./sandbox`          | sandbox policy intent (`buildAgentHostSandboxPolicy`, `hostFromUrl`)                                                                                           | Node     |
| `./transport`        | `AgentTransport` namespace — Basic-Auth signing, fetch helpers, `AgentTransport.Client`                                                                        | neutral  |

The Node fs backend (`NodeFsBackend`) is internal + test-only — it is not a
public subpath; workspace bindings use it in-process.

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
- **Not a Desktop bridge package.** `@grida/agent/transport` owns the
  AgentHost HTTP seam. Electron-specific window, dialog, shell, host-app, and
  file-path capabilities stay in Desktop's bridge contract.
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
model-provider router (the anti-goal above stands). Synthetic `claude-code/*`
model ids (`agent-provider/types.ts`) select it; continuity rides ACP
`session/resume`.

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

- [AgentHost](./docs/agent-host.md) — lifecycle, ownership, and what hosts
  must provide.
- [HTTP access](./docs/http-access.md) — Basic Auth, CORS, and Referer policy
  supplied by a host adapter.
- [Sandbox policy](./docs/sandbox-policy.md) — package-owned sandbox intent
  that hosts adapt to their sandbox runtime.

The wider architecture lives in the working-group docs:

- [Desktop (WG)](../../docs/wg/desktop/index.md) — one host binding for
  AgentHost, including renderer bridge, GRIDA-SEC-004, storage, and sandbox
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
