---
title: Desktop (WG)
description: Architecture and behavior contracts for Grida Desktop's native shell, browser, renderer and hosted services.
keywords: [desktop, electron, native agent host, ServicesSidecar, grida-sec-004]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Desktop (WG)

These documents own Desktop-specific contracts: native presentation, the
renderer bridge, browser pages and host services. Agent-related pages describe
the Desktop binding of the [agent RFC](../ai/agent/index.md).

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

The [built-in browser](./browser.md) defines standalone page ownership,
profile isolation, document lifetime and live workbench composition.

| Page                                               | Covers                                                                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Process model](./process-model.md)                | Electron main / native agent host / socketless `ServicesSidecar` / renderer — what each owns, main-owned loopback, and provider frames.                          |
| [Renderer bridge](./renderer-bridge.md)            | URL-loaded renderer doctrine — `loadURL("grida.co/desktop/*")`, path-scoped `window.grida`, `DesktopBridgeGate`.                                                 |
| [Resource loading](./resource-loading.md)          | How the renderer gets host-owned resource bytes — buffered (`data:`) vs streamed (privileged `grida-workspace:` scheme), Range/seeking, proxy-not-new-authority. |
| [Agent security](./agent-security.md)              | Desktop binding of `GRIDA-SEC-004`: bridge path scope, HTTP perimeter, sandbox, and secrets discipline.                                                          |
| [Desktop agent authority](./agent-sandbox-wrap.md) | The Desktop delta for contained host services, native host networking, per-principal raw execution, and permission modes above confinement.                      |
| [Agent storage layout](./agent-storage-layout.md)  | Which process keeps which files: native chat state, sidecar registries, credentials, preferences, and the earlier chat store.                                    |

## Processes

Desktop chat runs in the native agent host, which Electron main supervises
over private stdio. The retained sidecar is one composed server — the daemon
frame with the media routes — that owns media generation, files, recents,
workspaces, and secrets, and runs no chat. The renderer drives chat through
main's native chat bridge. See [Process model](./process-model.md).
