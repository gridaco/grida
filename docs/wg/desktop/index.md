---
title: Desktop (WG)
description: Grida Desktop is one host implementation of the agent RFC. These docs are delta-only — every fact here depends on the Electron + macOS/Linux/Windows host shape.
keywords: [desktop, electron, AgentSidecar, grida-sec-004]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Desktop (WG)

Grida Desktop is one host implementation of the
[agent RFC](../ai/agent/index.md). These docs are **delta-only** — every
fact here is something you cannot derive from the RFC because it depends
on the Electron + macOS/Linux/Windows host shape.

For the abstract contract:

- [Agent system RFC](../ai/agent/index.md) — protocol, locked tools,
  sessions, capability surface, sandbox placement.
- [Grida bindings](../ai/grida/index.md) — how the locked tools, the
  filesystem backends, and the built-in subagents land in Grida.
- [Grida Cloud Agent Runtime](../platform/grida-cloud-agent-runtime.md)
  — deferred hosted-provider design; Desktop V1 ships BYOK only.

For the user-facing app and the security boundary:

- [`desktop/README.md`](https://github.com/gridaco/grida/blob/main/desktop/README.md)
- [`GRIDA-SEC-004` in `SECURITY.md`](https://github.com/gridaco/grida/blob/main/SECURITY.md)

## Pages

| Page                                              | Covers                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Process model](./process-model.md)               | Electron main / `AgentSidecar` / renderer — the three-process boundary, the supervisor, the HTTP perimeter, the god class.                                               |
| [Renderer bridge](./renderer-bridge.md)           | URL-loaded renderer doctrine — `loadURL("grida.co/desktop/*")`, path-scoped `window.grida`, `DesktopBridgeGate`.                                                         |
| [Resource loading](./resource-loading.md)         | How the renderer gets host-owned resource bytes — buffered (`data:`) vs streamed (privileged `grida-workspace:` scheme), Range/seeking, proxy-not-new-authority.         |
| [Agent security](./agent-security.md)             | Desktop binding of `GRIDA-SEC-004`: bridge path scope, HTTP perimeter, sandbox, and secrets discipline.                                                                  |
| [Agent sandbox wrap](./agent-sandbox-wrap.md)     | How desktop adapts package sandbox intent to `srt`, the shell permission model (`accept-edits`/`auto`) and per-call sub-policy, and supervises the wrapped AgentSidecar. |
| [Agent storage layout](./agent-storage-layout.md) | Desktop `${userData}` files and SQLite session storage.                                                                                                                  |

## God class

The desktop's agent system is wired by **one class** — `AgentHost` in
[`packages/grida-ai-agent/src/agent-host.ts`](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/src/agent-host.ts).
It owns the lifetime of every
long-lived service: sessions store, stream registry, provider registry,
workspace registry, secrets, files, shell, runtime. Public API:
`constructor(opts) / start() / stop()`. HTTP routes (`http/routes/*`) are thin
wrappers — business logic lives behind the class. The Electron-side
[`agent-sidecar-supervisor.ts`](https://github.com/gridaco/grida/blob/main/desktop/src/main/agent-sidecar-supervisor.ts)
spawns it; the renderer-side chat seam in `editor/lib/agent-chat`
coordinates today's `use-chat-session`, bridge transport, and
refresh-on-stream-end wiring.

Three orchestrator files; everything else is a small collaborator with
one job.
