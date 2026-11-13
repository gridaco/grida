---
title: Process model
description: Why Grida Desktop runs the native agent host and a retained media sidecar beside Electron main, what each owns, and where the boundaries sit.
keywords:
  [
    desktop,
    native agent host,
    AgentSidecar,
    electron,
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

Grida Desktop is one host of the `computer` environment from the
[agent RFC](../ai/agent/environments.md#computer). It runs four kinds of
process:

| Process                                 | Owns                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron main                           | Windows, menus, dialogs, deep links, supervision, guarded IPC, the supervised provider transport, and the ChatGPT sign-in ceremony and credential custody. |
| Native agent host                       | Chat: sessions, the agent loop, tools, permissions, confined commands, and their durable state. Main supervises it over private stdio.                     |
| Retained media sidecar (`AgentSidecar`) | Media generation and its provider custody, plus the files, recents, workspaces, and secrets routes, behind the loopback daemon perimeter. It runs no chat. |
| URL-loaded renderer                     | Presentation. It reaches host capabilities only through the typed `window.grida` bridge.                                                                   |

A native model provider supplies capacity to the Grida-owned loop in the
native host. The experimental ChatGPT Subscription provider is not ACP:
**“Sign in with your ChatGPT account” connects eligible model capacity while
Grida retains the session, tools, approvals, sandbox, transcript, and loop.**

## Why not Electron main

Electron main is the right home for windows, menus, dialogs, protocol
handlers, OS integration, and the destination-bound Chromium transport that
must follow the host's trusted network route. It is not the right home for an
agent loop that outlives renderer reloads, for confined command execution, or
for long-lived provider and file state. Keeping those in separate processes
gives review a small, auditable surface per authority and lets headless
clients share the same native host.

## Where it sits

```
┌─ Electron main ───────────────────────────────────────────────────┐
│  windows, dialogs, file-open, deep links, single-instance         │
│        │ spawn + supervise                                        │
│  ┌─ native agent host ─────────────────────────────────────────┐  │
│  │ chat sessions, agent loop, tools, confined commands         │  │
│  │ private stdio: ACP + supervised provider capability         │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─ exact 127.0.0.1:<random> listener ─────────────────────────┐  │
│  │ accept paused; transfer connected socket on Node IPC fd 3   │  │
│  └──────────────────────────────┬──────────────────────────────┘  │
│                                 ▼                                 │
│  ┌─ socketless AgentSidecar — DaemonServer + media routes ─────┐  │
│  │ authenticated HTTP on only the transferred connection       │  │
│  │ media / files / recents / workspaces / secrets              │  │
│  └───────────────┬──────────────────────────────────────────────┘  │
│                  │ bounded framed stdin/stdout                     │
│                  ▼                                                 │
│  ┌─ dedicated non-persistent Chromium Session ─────────────────┐  │
│  │ destination-bound provider HTTP through the system route    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─ Entry renderer + main-role auxiliary renderers ────────────┐  │
│  │ loadURL("https://grida.co/desktop/...")                     │  │
│  │ window.grida → preload → main IPC / authenticated sidecar   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

The renderer reaches chat only through main's guarded native chat IPC. It
never sees the sidecar's port or password as page data: main generates a
per-spawn password, passes it to the sidecar in the versioned private-channel
bootstrap frame, and preload fetches the connection tuple through guarded IPC
into closure scope. See [security](./agent-security.md) for the composed
controls.

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

## What the retained sidecar owns

| Concern              | Why                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Media generation     | Image, video, and audio operations and their provider credentials. See [storage-layout](./agent-storage-layout.md).                      |
| Document registry    | `docId → {path, mtime}`; dedups windows on the same file.                                                                                |
| Workspace registry   | Persisted to `workspaces.json`. RFC variable expansion: [tools / capability requirements](../ai/agent/tools.md#capability-requirements). |
| Atomic file I/O      | Write-to-temp + rename; centralized so dirty tracking works.                                                                             |
| Recent files (canon) | Persisted; `addRecentDocument` is a mirror, not truth.                                                                                   |

It does not own chat, sessions, the agent loop, command execution, or
ChatGPT credentials. It also does not own windows, file-association plumbing,
editor state, or upstream entitlement and billing policy.

## Division of responsibility

**Native agent host.** Run chat sessions and the agent loop, persist them under
its private state directory, execute tools and confined commands under the
captured workspace and permission grants, and reach providers either directly
or through main's supervised capability on its private stdio. The
[native client protocol](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/docs/rust-client-protocol.md)
defines the wire.

**`AgentSidecar`.** Hold media provider credentials at runtime. Start the
daemon without a listener and serve only main-transferred connected sockets.
Enforce its own HTTP perimeter — Basic Auth header, `Referer` check against
`/desktop/*`, `Origin` allowlist — as defense-in-depth under
[`GRIDA-SEC-004`](https://github.com/gridaco/grida/blob/main/SECURITY.md).
Refuse to start if the host cannot supply its HTTP perimeter config.

**Electron main.** Supervise both children. Keep daemon credentials inside
preload closure. Own versioned, non-secret Desktop preferences. Own the exact
loopback listener and transfer only accepted connected sockets. Own the
destination grants and execute bounded provider-network operations through a
dedicated Chromium session. Validate IPC sender frames and window roles on
every native handler. See [security](./agent-security.md).

**The renderer.** Use `window.grida` as the _only_ path to host capabilities.
Surface provider connection state honestly. The renderer never receives
ChatGPT authorization codes or credentials. See
[renderer-bridge](./renderer-bridge.md).

## ChatGPT authorization ceremony

The ChatGPT provider is an experimental interoperability profile. Its local
credential boundary is active, while stable product activation remains gated
on a legal/support contract with OpenAI. Desktop defaults to the public Codex
native OAuth client identity with a host-owned override and pins the OpenAI
authorization/token plus ChatGPT Responses destinations; it does not import
Codex credentials or run Codex.

1. The renderer requests **“Sign in with your ChatGPT account.”**
2. Electron main owns a short-lived, configured loopback callback and
   system-browser navigation.
3. Main's in-process subscription host owns PKCE/state, token exchange,
   bounded claim parsing, credential persistence, refresh, and sign-out.
4. The native agent host receives only an opaque scope and the selected model;
   main injects credentials at the provider edge of the supervised transport.
5. The renderer receives safe status and display metadata only.

The retained sidecar mounts no ChatGPT routes and holds no subscription
credential. The flow does not reuse Grida's separate custom-scheme
account-sign-in boundary. It is registered as
**`GRIDA-SEC-008: ChatGPT subscription OAuth credential boundary`**. The
current profile does not send an OIDC nonce or independently verify JWT
signature/JWKS/issuer/audience; account/display claims are trusted only
because they are parsed from the exact TLS-authenticated token endpoint
response. See [Agent security](./agent-security.md).

## What can change

- **Containment.** On macOS and Linux the sidecar runs inside one outer
  sandbox and native commands run under per-command confinement; Windows is
  currently unwrapped. See [Desktop agent authority](./agent-sandbox-wrap.md).
- **Transport.** The sidecar's client protocol remains loopback HTTP with a
  main-owned listener; provider control/data stays on separately bounded
  framed stdin/stdout.
- **Headless clients.** The native host runs tasks and serves ACP without
  Electron. [Connect an agent client](../../agent/clients.md)

## See also

- [Renderer bridge](./renderer-bridge.md) — the other end of the bridge.
- [Security](./agent-security.md) — GRIDA-SEC-004 defense-in-depth controls.
- [Desktop agent authority](./agent-sandbox-wrap.md) — host containment,
  native networking, and confined raw runtimes.
- [Storage layout](./agent-storage-layout.md) — which process keeps which
  files.
- [Agent system RFC / environments / computer](../ai/agent/environments.md#computer)
  — the abstract model this implements.
- [Grida Gateway (GG)](../platform/hosted-ai.md)
  — the shipped hosted model-capacity provider; the agent loop stays local.
- [ChatGPT Subscription native provider](../ai/agent/chatgpt-subscription-provider.md)
  — the golden native-provider contract; never ACP.
