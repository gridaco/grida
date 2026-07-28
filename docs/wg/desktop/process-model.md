---
title: Process model
description: Why Grida Desktop runs a long-lived Node agent sidecar alongside Electron main, what it owns, and where the boundary sits. The three-process model and the composed daemon.
keywords:
  [
    desktop,
    AgentSidecar,
    electron,
    utility-process,
    agent-host,
    grida-sec-004,
    grida-sec-008,
  ]
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

A native model provider supplies capacity to this sidecar-owned Grida loop.
The experimental ChatGPT Subscription provider is not ACP: **“Sign in with
your ChatGPT account” connects eligible model capacity while Grida retains the
session, tools, approvals, sandbox, transcript, and loop.**

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
│  ┌─ Entry renderer + main-role auxiliary renderers ────────────┐  │
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

## Entry window model

Desktop has one canonical entry window. Its identity is stable while its role
changes. Account sign-in, onboarding, and the normal workstation all share
that window identity.

The entry window has exactly one user-facing role:

| Grida account | Onboarding | Entry role |
| ------------- | ---------- | ---------- |
| Signed out    | Any state  | Sign-in    |
| Signed in     | Incomplete | Onboarding |
| Signed in     | Complete   | Main       |

The live account session and versioned native Desktop preferences are the only
authorities for this decision. The loaded URL is an output of the selected
role, not evidence that the role has been earned. An indeterminate account
check must not be treated as a signed-out session.

Sign-in and onboarding use a compact presentation. Main uses workstation
dimensions. A role transition reuses the canonical window, replaces its
navigation history, and changes its presentation before the destination is
shown. Back navigation therefore cannot cross an account or onboarding
boundary. Sign-in can appear before the local sidecar is ready; authenticated
Onboarding and Main wait for sidecar readiness so their first workspace or
model operation cannot race host startup.

Role-scoped IPC does not grant onboarding the sidecar connection tuple: that
tuple is a bearer capability for the complete daemon surface. Electron main
instead owns two narrow onboarding workspace operations—read the managed
default, or show a folder picker and register the chosen directory—and returns
only the resulting workspace DTO.

Only Main may create auxiliary document, workspace, or settings windows.
Payload launch intents wait while the entry role is Sign-in or Onboarding, then
resume after Main is established. Account-authentication callbacks are
control-plane events for the entry window and must be handled immediately
rather than waiting behind that payload queue.

Global sign-out first asks auxiliary work windows to close. If any window
refuses because work would be lost, the account session remains unchanged. The
Settings surface that initiated sign-out may remain only long enough to receive
completion; it closes as the canonical entry window returns to Sign-in. A
confirmed explicit sign-out resets onboarding completion so the next signed-in
account receives the entry flow. Application activation and account-state
changes likewise reconcile and focus this same entry window instead of
creating a competing entry surface.

Renderer storage is not an ongoing onboarding authority. During the first
upgrade from the former renderer-owned flow, Electron main may consume the one
exact legacy completion flag through a fixed hidden same-origin surface. Main
durably records that the migration ran before the value can affect a role; once
consumed, renderer storage cannot complete, reset, or suppress onboarding. The
normal Welcome surface neither renders onboarding nor decides whether it is
needed.

## What the daemon owns

| Concern              | Why                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.json`          | One secrets file, chmod 0o600, lifetime is the user. See [storage-layout](./agent-storage-layout.md).                                                                                                                                                                                                                                                                                           |
| Provider registry    | Persists a provider-qualified session choice. An explicit provider or explicitly changed model is an intentional switch; otherwise the stored provider remains sticky while the model is omitted or unchanged. A fresh session uses ready ChatGPT Subscription first, otherwise text BYOK, then GG, then configured endpoint/local capacity. It never silently switches provider during a turn. |
| Agent loop           | Outlives the renderer; resumable by `sessionId`. RFC contract: [session lifecycle](../ai/agent/session.md).                                                                                                                                                                                                                                                                                     |
| Document registry    | `docId → {path, mtime}`; dedups windows on the same file.                                                                                                                                                                                                                                                                                                                                       |
| Workspace registry   | Persisted to `workspaces.json`. RFC variable expansion: [tools / capability requirements](../ai/agent/tools.md#capability-requirements).                                                                                                                                                                                                                                                        |
| Atomic file I/O      | Write-to-temp + rename; centralized so dirty tracking works.                                                                                                                                                                                                                                                                                                                                    |
| Recent files (canon) | Persisted; `addRecentDocument` is a mirror, not truth.                                                                                                                                                                                                                                                                                                                                          |

## What the daemon does _not_ own

- Windows, menus, dialogs, deep links — Electron main.
- File-association plumbing (`open-file`, argv, second-instance) —
  Electron main. The daemon doesn't know how a path arrived; it only
  knows the path.
- Editor state, rendering, dirty-flag UI — renderer. The daemon stores
  bytes; the renderer decides what "dirty" means against its own
  snapshot.
- Upstream account entitlement, billing, and usage policy. Each capacity
  source owns those rules behind the native-provider contract; Grida owns
  provider selection and session attribution.
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
the canonical Grida agent home so `auth.json` lands outside Electron's browser
profile. Keep daemon credentials inside preload closure. Own versioned,
non-secret Desktop preferences in the browser profile. Own the exact loopback
listener and transfer only accepted connected sockets to the sidecar. Own the
destination grants and execute the two bounded provider-network operation
classes through a dedicated Chromium session. Validate IPC sender frames against
`EDITOR_BASE_URL + /desktop/*` on
every native handler — the preload's path-scoping should make this redundant;
doing it anyway is the right kind of paranoid. See
[security](./agent-security.md).

**The renderer's job.** Use `window.grida` as the _only_ path to the
daemon. Start and abort agent streams through `window.grida.agent`.
Surface provider connection state honestly and let provider-unavailable run
errors come from the daemon. The renderer never receives ChatGPT authorization
codes or credentials. See [renderer-bridge](./renderer-bridge.md).

## ChatGPT authorization ceremony

The ChatGPT provider is implemented as an experimental interoperability
profile. Its local credential boundary is active, while stable product
activation remains gated on a legal/support contract with OpenAI.
Desktop defaults to the public Codex native OAuth client identity with a
host-owned override and pins the OpenAI authorization/token plus ChatGPT
Responses destinations; it does not import Codex credentials or run Codex.

The process split is:

1. The renderer requests **“Sign in with your ChatGPT account.”**
2. Electron main owns a short-lived, configured loopback callback and
   system-browser navigation.
3. AgentSidecar owns PKCE/state, token exchange, bounded claim parsing,
   credential persistence, refresh, and sign-out.
4. Main forwards only the bounded one-time callback result and reports browser
   success only after AgentSidecar confirms durable completion.
5. The renderer receives safe status and display metadata only.

Main may route callback or token-response bytes transiently but never persists
or logs them. AgentSidecar receives no generic bind capability. The flow does
not reuse Grida's separate custom-scheme account-sign-in boundary.

This ceremony is registered as
**`GRIDA-SEC-008: ChatGPT subscription OAuth credential boundary`**. Its
listener, bridge, credential manager, exact provider policy, cancellation,
sign-out, and negative tests form the active local boundary. The current
profile does not send an OIDC nonce or independently verify JWT
signature/JWKS/issuer/audience; account/display claims are trusted only
because they are parsed from the exact TLS-authenticated token endpoint
response. See [Agent security](./agent-security.md).

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
- [Storage layout](./agent-storage-layout.md) — agent-home file map and the
  separate native-preferences boundary.
- [Agent system RFC / environments / computer](../ai/agent/environments.md#computer)
  — the abstract model this implements.
- [Grida Gateway (GG)](../platform/hosted-ai.md)
  — the shipped hosted model-capacity provider; the agent loop stays local.
- [ChatGPT Subscription native provider](../ai/agent/chatgpt-subscription-provider.md)
  — the golden native-provider contract; never ACP.
- [opencode](https://github.com/sst/opencode) — reference architecture
  for daemon split, provider registry, `auth.json` shape, agent-as-data.
