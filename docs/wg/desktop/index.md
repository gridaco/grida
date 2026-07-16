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
- [Grida Gateway (GG)](../platform/hosted-ai.md)
  — the shipped no-key AI path: scoped-token federation → metered
  first-party gateway → org-credit spend. BYOK still bypasses it.

For the user-facing app and the security boundary:

- [`desktop/README.md`](https://github.com/gridaco/grida/blob/main/desktop/README.md)
- [`GRIDA-SEC-004` in `SECURITY.md`](https://github.com/gridaco/grida/blob/main/SECURITY.md)

## Pages

| Page                                               | Covers                                                                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Process model](./process-model.md)                | Electron main / socketless `AgentSidecar` / renderer — main-owned loopback, connected-socket capability transfer, provider frames, and the composed server.      |
| [Renderer bridge](./renderer-bridge.md)            | URL-loaded renderer doctrine — `loadURL("grida.co/desktop/*")`, path-scoped `window.grida`, `DesktopBridgeGate`.                                                 |
| [Resource loading](./resource-loading.md)          | How the renderer gets host-owned resource bytes — buffered (`data:`) vs streamed (privileged `grida-workspace:` scheme), Range/seeking, proxy-not-new-authority. |
| [Agent security](./agent-security.md)              | Desktop binding of `GRIDA-SEC-004`: bridge path scope, HTTP perimeter, sandbox, and secrets discipline.                                                          |
| [Desktop agent authority](./agent-sandbox-wrap.md) | The Desktop delta for contained host services, native host networking, per-principal raw execution, and permission modes above confinement.                      |
| [Agent storage layout](./agent-storage-layout.md)  | Desktop `${userData}` files and SQLite session storage.                                                                                                          |

## God class

The desktop's agent system is wired by **one composed server** — `createAgentDaemon` (`DaemonServer` + the agent tenant) in
[`packages/grida-daemon/src/daemon-server.ts`](https://github.com/gridaco/grida/blob/main/packages/grida-daemon/src/daemon-server.ts).
It owns the lifetime of every
long-lived service: sessions store, stream registry, provider registry,
workspace registry, secrets, files, shell, runtime. Public API:
`constructor(opts) / start({ listen? }) / fetch(Request) / stop()`. HTTP routes
are thin wrappers — business logic lives behind the class. The Electron-side
[`agent-sidecar-supervisor.ts`](https://github.com/gridaco/grida/blob/main/desktop/src/main/agent-sidecar-supervisor.ts)
spawns it; the renderer-side chat seam in `editor/lib/agent-chat`
coordinates today's `use-chat-session`, bridge transport, and
refresh-on-stream-end wiring.

Three orchestrator files; everything else is a small collaborator with
one job.
