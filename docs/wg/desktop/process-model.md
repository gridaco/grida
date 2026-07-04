---
title: Process model
description: Why Grida Desktop runs a long-lived Node agent sidecar alongside Electron main, what it owns, and where the boundary sits. The three-process model and the composed daemon.
keywords:
  [desktop, AgentSidecar, electron, utility-process, agent-host, grida-sec-004]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Process model

> **Status: V1.x in flight.** Core lives in `@grida/agent`; desktop is
> the host adapter. The RFC contract for an agent host lives in
> [`../ai/agent/environments.md#computer`](../ai/agent/environments.md).

`AgentSidecar` is the **agent host process** Electron main spawns and
supervises. It's an instance of the `computer` environment from the
[agent RFC](../ai/agent/index.md): one long-lived process that owns
secrets, sessions, the agent loop, and the capability surface; an
Electron shell that owns windows and the OS; and a URL-loaded renderer
that reaches the host only through a typed bridge.

Naming: the agent sidecar is `AgentSidecar`; the npm packages are
`@grida/daemon` (host layer) + `@grida/agent` (agent tenant); the **class inside** is `DaemonServer`, composed via `createAgentDaemon`. The name says
what owns lifecycle and capability policy. See [god class](#god-class)
below.

## Why not Electron main

Electron main is the right home for windows, menus, dialogs, protocol
handlers, and OS integration. It is not the right home for:

- A provider registry resolving "which language model do I call right
  now?"
- An agent loop that streams over SSE across renderer reloads.
- Atomic file I/O on documents whose lifetime exceeds any single window.
- An `auth.json` whose lifetime is the user, not the app launch.

Coupling that to BrowserWindow lifecycles forces unrelated UI through
the same IPC and bloats the security audit surface. A separate sidecar
keeps the agent alive across renderer reloads, gives review one process
to audit, and leaves room for a future CLI to share the same backend.

## Where it sits

```
┌─ Electron main ────────────────────────────────────────────────┐
│  windows, menus, dialogs, file-open, deep links, single-instance│
│        │  spawn + supervise (AgentSidecarSupervisor)                  │
│        ▼                                                         │
│  ┌─ AgentSidecar — DaemonServer + agent tenant (createAgentDaemon) ─┐  │
│  │  HTTP 127.0.0.1:<random>  Basic Auth + Referer guard      │  │
│  │  sessions/  providers/  workspaces/  secrets/             │  │
│  │  files/  shell/  runtime/  http/                          │  │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌─ Renderer (one per doc) ────────────────────────────────┐   │
│  │  loadURL("https://grida.co/desktop/...")                │   │
│  │  window.grida → preload → HTTP to AgentSidecar                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

The renderer never sees the sidecar's port or password as page data.
Electron main generates a per-spawn password, passes it to the sidecar
over stdin, and preload fetches the connection tuple through guarded IPC
into closure scope. See [security](./agent-security.md) for the five-layer
breakdown.

## What the daemon owns

| Concern              | Why                                                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.json`          | One secrets file, chmod 0o600, lifetime is the user. See [storage-layout](./agent-storage-layout.md).                                                                                                                   |
| Provider registry    | Resolves providers by precedence — explicit choice, then BYOK (OpenRouter, then AI Gateway), then the hosted Grida provider, then unavailable. See [Grida Gateway (GG)](../platform/hosted-ai.md) for the no-BYOK path. |
| Agent loop           | Outlives the renderer; resumable by `sessionId`. RFC contract: [session lifecycle](../ai/agent/session.md).                                                                                                             |
| Document registry    | `docId → {path, mtime}`; dedups windows on the same file.                                                                                                                                                               |
| Workspace registry   | Persisted to `workspaces.json`. RFC variable expansion: [tools / capability requirements](../ai/agent/tools.md#capability-requirements).                                                                                |
| Atomic file I/O      | Write-to-temp + rename; centralized so dirty tracking works.                                                                                                                                                            |
| Recent files (canon) | Persisted; `addRecentDocument` is a mirror, not truth.                                                                                                                                                                  |

## What the daemon does _not_ own

- Windows, menus, dialogs, deep links — Electron main.
- File-association plumbing (`open-file`, argv, second-instance) —
  Electron main. The daemon doesn't know how a path arrived; it only
  knows the path.
- Editor state, rendering, dirty-flag UI — renderer. The daemon stores
  bytes; the renderer decides what "dirty" means against its own
  snapshot.
- Subscription billing checks and usage ingest — not shipped in V1.
  A future hosted provider belongs behind the provider contract, not in
  the local agent surface.
- The agent loop's _protocol_ — locked tools, capability surface,
  session schema, AI SDK v6 chunk shape. Those are the
  [agent RFC](../ai/agent/index.md); the daemon implements them, it
  doesn't define them.

## God class

`DaemonServer` (`packages/grida-daemon/src/daemon-server.ts`, composed with the agent tenant via `@grida/agent/server`) is the
one class that wires the services. Lifecycle:

```ts
const host = createAgentDaemon({
  password,
  userDataPath,
  httpAccess,
});
await host.start(); // spawn HTTP, open SQLite, restore registries
const port = host.port;
await host.stop();
```

Each collaborator is a small class in its own subdirectory; the host
holds private references and shutdown order. HTTP routes are thin wrappers that
call into collaborators. The agent business logic that once made
[`http/routes/agent.ts`](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/src/http/routes/agent.ts)
a ~660-LOC god-file now lives behind
[`AgentRuntime`](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/src/runtime/index.ts);
the route is a thin wrapper.

## Division of responsibility

**`AgentSidecar`'s job.** Hold every secret at runtime. Enforce its own HTTP
perimeter — Basic Auth, `Referer` check against `/desktop/*`, `Origin`
allowlist — as defense-in-depth under
[`GRIDA-SEC-004`](https://github.com/gridaco/grida/blob/main/SECURITY.md).
Stream long-running work under a `sessionId` the renderer can abort.
Refuse to start if the host cannot supply its HTTP perimeter config —
failing loud beats silently degrading.

**The shell's job.** Run one supervisor (`AgentSidecarSupervisor`). Forward
Electron's `userData` path so `auth.json` lands in the right place. Keep
daemon credentials inside preload closure. Validate IPC sender frames
against `EDITOR_BASE_URL + /desktop/*` on every native handler — the
preload's path-scoping should make this redundant; doing it anyway is
the right kind of paranoid. See [security](./agent-security.md).

**The renderer's job.** Use `window.grida` as the _only_ path to the
daemon. Start and abort agent streams through `window.grida.agent`.
Surface BYOK key presence honestly and let provider-unavailable run errors
come from the daemon. See [renderer-bridge](./renderer-bridge.md).

## What can change

- **srt wrap (V1.x).** AgentSidecar runs inside [`srt`](./agent-sandbox-wrap.md) at
  the OS boundary. The supervisor flips the `RunAsNode` Electron fuse
  and switches from `utilityProcess.fork` to
  `child_process.spawn(process.execPath, …)`. See
  [sandbox-wrap](./agent-sandbox-wrap.md).
- **Transport.** Loopback HTTP is fine for V1. A Unix domain socket
  (macOS/Linux) for OS-level access control is on the table; Windows
  stays on loopback.
- **CLI consumer.** `grida-agent serve`, `run`, and `sessions` exercise
  the same daemon/client path without Electron.

## See also

- [Renderer bridge](./renderer-bridge.md) — the other end of the bridge.
- [Security](./agent-security.md) — five-layer GRIDA-SEC-004 breakdown.
- [Sandbox wrap](./agent-sandbox-wrap.md) — AgentSidecar's outer-wrap policy.
- [Storage layout](./agent-storage-layout.md) — `${userData}` file map.
- [Agent system RFC / environments / computer](../ai/agent/environments.md#computer)
  — the abstract model this implements.
- [Grida Gateway (GG)](../platform/hosted-ai.md)
  — the shipped hosted model-capacity provider; the agent loop stays local.
- [opencode](https://github.com/sst/opencode) — reference architecture
  for daemon split, provider registry, `auth.json` shape, agent-as-data.
