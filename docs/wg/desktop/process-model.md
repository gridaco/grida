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
handlers, OS integration, and the destination-bound Chromium transport that
must follow the host's trusted network route. It is not the right home for:

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
┌─ Electron main ───────────────────────────────────────────────────┐
│  windows, dialogs, file-open, deep links, single-instance         │
│        │ spawn + supervise                                        │
│  ┌─ exact 127.0.0.1:<random> listener ─────────────────────────┐  │
│  │ accept paused; transfer connected socket on Node IPC fd 3   │  │
│  └──────────────────────────────┬──────────────────────────────┘  │
│                                 ▼                                 │
│  ┌─ socketless AgentSidecar — DaemonServer + agent tenant ─────┐  │
│  │ authenticated HTTP on only the transferred connection       │  │
│  │ sessions / providers / workspaces / secrets / agent runtime │  │
│  └───────────────┬──────────────────────────────────────────────┘  │
│                  │ bounded framed stdin/stdout                     │
│                  ▼                                                 │
│  ┌─ dedicated non-persistent Chromium Session ─────────────────┐  │
│  │ destination-bound provider HTTP through the system route    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─ Renderer (one per document) ───────────────────────────────┐  │
│  │ loadURL("https://grida.co/desktop/...")                     │  │
│  │ window.grida → preload → authenticated AgentSidecar HTTP    │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

The renderer never sees the sidecar's port or password as page data.
Electron main generates a per-spawn password, passes it to the sidecar
in the versioned private-channel bootstrap frame, and preload fetches the
connection tuple through guarded IPC
into closure scope. See [security](./agent-security.md) for the composed
defense-in-depth controls.

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
await host.start({ listen: false }); // build routes, open state, no socket bind
// Electron main accepts loopback sockets and delivers each connected request.
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

**`AgentSidecar`'s job.** Hold steady-state provider credentials at runtime.
Start the daemon without a listener and serve only main-transferred connected
sockets. Enforce its own HTTP
perimeter — Basic Auth, `Referer` check against `/desktop/*`, `Origin`
allowlist — as defense-in-depth under
[`GRIDA-SEC-004`](https://github.com/gridaco/grida/blob/main/SECURITY.md).
Stream long-running work under a `sessionId` the renderer can abort.
Refuse to start if the host cannot supply its HTTP perimeter config —
failing loud beats silently degrading.

**Electron main's job.** Run one supervisor (`AgentSidecarSupervisor`). Forward
Electron's `userData` path so `auth.json` lands in the right place. Keep daemon
credentials inside preload closure. Own the exact loopback listener and
transfer only accepted connected sockets to the sidecar. Own the destination
grants and execute the two bounded provider-network operation classes through a
dedicated Chromium session. Validate IPC sender frames against
`EDITOR_BASE_URL + /desktop/*` on
every native handler — the preload's path-scoping should make this redundant;
doing it anyway is the right kind of paranoid. See
[security](./agent-security.md).

**The renderer's job.** Use `window.grida` as the _only_ path to the
daemon. Start and abort agent streams through `window.grida.agent`.
Surface BYOK key presence honestly and let provider-unavailable run errors
come from the daemon. See [renderer-bridge](./renderer-bridge.md).

## What can change

- **Authority split (V1.x).** On macOS and Linux, AgentSidecar runs inside one
  `srt` outer boundary; Windows is currently unwrapped. The landed
  [Desktop authority model](./agent-sandbox-wrap.md) separates native provider
  networking while retaining that coarse host containment. Separating each raw
  runtime into a supervisor-owned authority path remains work to do.
- **Transport.** The client protocol remains loopback HTTP, while ownership is
  capability-shaped: main owns the exact listener and the sidecar receives only
  accepted connected sockets. Provider control/data remains on separately
  bounded framed stdin/stdout.
- **CLI consumer.** `grida-agent serve`, `run`, and `sessions` exercise
  the same daemon/client path without Electron.

## See also

- [Renderer bridge](./renderer-bridge.md) — the other end of the bridge.
- [Security](./agent-security.md) — GRIDA-SEC-004 defense-in-depth controls.
- [Desktop agent authority](./agent-sandbox-wrap.md) — host containment,
  native networking, and confined raw runtimes.
- [Storage layout](./agent-storage-layout.md) — `${userData}` file map.
- [Agent system RFC / environments / computer](../ai/agent/environments.md#computer)
  — the abstract model this implements.
- [Grida Gateway (GG)](../platform/hosted-ai.md)
  — the shipped hosted model-capacity provider; the agent loop stays local.
- [opencode](https://github.com/sst/opencode) — reference architecture
  for daemon split, provider registry, `auth.json` shape, agent-as-data.
