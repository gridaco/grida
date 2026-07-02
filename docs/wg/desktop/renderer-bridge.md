---
title: Renderer bridge
description: Why Grida Desktop URL-loads grida.co/desktop/* instead of bundling editor source — the "one editor codebase, two hosts" doctrine and the path-scoped window.grida bridge.
keywords:
  [desktop, electron, renderer, bridge, capability-boundary, grida-sec-004]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Renderer bridge

> **Status: V1 architecture in place.** Load model is committed; routes
> under `/desktop/*` will keep growing.

Grida Desktop's renderer doesn't bundle the editor. It does
`loadURL('https://grida.co/desktop/...')` (or
`http://localhost:3000/desktop/...` in dev) and runs the same Next.js
app the web visitor runs. The bridge (`window.grida`) is exposed only
when `location.pathname.startsWith('/desktop/')`.

This is the **"one editor codebase, two hosts"** doctrine. Web visitors
get the canvas demo at `/svg`; the desktop host gets the workstation
surface at `/desktop/svg`. Same React tree, same components, different
capability boundary.

## Why URL-load instead of bundle

Bundling the editor's compiled output into the Electron build has costs
we're not willing to pay:

- **Two release trains.** Every editor change would require an Electron
  rebuild, signing, notarization (macOS), and update propagation. The
  web is `next deploy`; bundled desktop would lag by days.
- **Update friction.** Editor fixes ship instantly to the web; desktop
  users would wait for the next `update-electron-app` cycle. For an app
  whose value is "the latest editor, locally," that's the wrong
  direction.
- **Codebase drift.** "Same source, different bundle" rots fast. The
  web side grows web-only deps (analytics, dynamic Next features) and
  the bundled desktop accrues a permanent porting tax.

URL-loading flips it: editor improvements ship to both surfaces the
moment they deploy. The Electron build only changes when the **shell**
changes — new IPC, new agent server surface, OS integration.

## The capability boundary

Two routing rules make the boundary visible:

1. **Web visitors see a CTA, not the workstation.** `/desktop/*` routes
   ship a `DesktopBridgeGate` that checks for `window.grida`. If absent
   (web browser), the route renders `<OpenInDesktopCta />`. The
   capability gap is surfaced, not silently degraded.
2. **The bridge is path-scoped.** Preload exposes `window.grida` only
   when the renderer is under `/desktop/*`, with preload history guards and
   main-process navigation guards covering same-document navigation.
   XSS on any other grida.co page cannot reach the agent server. This is
   layer 1 of [`GRIDA-SEC-004`](https://github.com/gridaco/grida/blob/main/SECURITY.md);
   see [security](./agent-security.md) for the full five-layer breakdown.

```
grida.co  (one Next.js app)
│
├── /  /pricing  /dashboard  ...    ← web: no window.grida
│
└── /desktop/*                       ← desktop: window.grida exposed
    ├── /desktop/welcome             (signed-in landing)
    ├── /desktop/svg?docId=...       (one URL per doc window)
    ├── /desktop/workspace           (local workspace)
    └── /desktop/settings            (BYOK providers)
```

## What lives where

| Concern                     | Where                                       |
| --------------------------- | ------------------------------------------- |
| Editor UI, AI sidebar       | `editor/scaffolds/desktop/`                 |
| `/desktop/*` route group    | `editor/app/desktop/`                       |
| Typed bridge client         | `editor/lib/desktop/bridge.ts`              |
| Desktop chat seam           | `editor/lib/agent-chat/`                    |
| Preload + Electron main     | `desktop/src/`                              |
| `AgentSidecar` agent server | `packages/grida-ai-agent/` (`@grida/agent`) |
| `window.grida` shape        | `@grida/desktop-bridge`                     |

The bridge type shape lives in `@grida/desktop-bridge`. Desktop preload
and the editor-side typed client both consume that contract — single
source of truth for what the renderer can see. The package is only the
renderer-visible bridge protocol; Electron IPC channel names stay in Desktop
source, and daemon HTTP stays in `@grida/daemon/transport` + `@grida/agent/transport`.

`window.grida.protocol` is currently `1`. `/desktop/*` routes must distinguish
a missing bridge from an unsupported protocol before rendering agent UI. Native
capabilities live under `bridge.caps.native`; daemon route capabilities come
from `bridge.handshake()` so they are the real server capabilities, not a static
Desktop guess.

## Division of responsibility

**Web codebase.** All UI inside `/desktop/*`. The `DesktopBridgeGate`
and the `OpenInDesktopCta` fallback. A CSP-strict layout for the route
group (no third-party scripts, no analytics, no Sentry). An ESLint
boundary rule restricting `(desktop)` and `scaffolds/desktop/` imports
to bridge clients + UI primitives + `@grida/*` packages. Without the
rule, the layering rots silently.

**Electron host.** Load only `EDITOR_BASE_URL + /desktop/...`; block
navigation elsewhere via preload history guards plus main-process
`will-navigate` / `did-navigate-in-page`; route external links through
`shell.openExternal`. Expose `window.grida` exclusively when the
renderer is under `/desktop/*`, never leaking agent server credentials onto
`window`. All native-OS calls (dialogs, file paths, deep links, Dock menus)
— renderer asks, main answers.

**`AgentSidecar`.** See [process-model](./process-model.md). Short version:
secrets, state, agent loop. Desktop preload delegates daemon HTTP calls to
`AgentTransport.Client`; it does not duplicate daemon route strings, SSE
parsing, or stream resume headers. The renderer holds no tokens; the shell
holds no business logic.

## Anti-patterns

- **Renderer holding tokens.** No OAuth access/refresh tokens, no BYOK
  API keys. `secrets.get` is not in the bridge for a reason.
- **`useHost` / `HostProvider` in `(desktop)`.** That's the web-side
  "am I in the wrapper" hook. The desktop bridge is a typed client, not
  a React context.
- **`EDITOR_BASE_URL` in renderer code.** The renderer is _served from_
  that base; it should never need to know its own URL.
- **Third-party scripts in `/desktop/*`.** Analytics, Sentry, marketing
  tags ship a network boundary the user didn't opt into and a CSP
  exception we don't want.
- **OPFS / IndexedDB for documents.** The agent server owns document
  persistence. The web `/svg` demo uses OPFS; that's its scope, not
  desktop's.

## What can change

- **Bridge package promotion.** `@grida/desktop-bridge` is private today; make
  it publishable only when a second host or separately versioned renderer
  needs it.
- **More `/desktop/*` route kinds.** V1: `welcome`, `svg`, `workspace`,
  `settings`. V2 modules (`.grida`, forms, db) plug in by registering
  an extension → renderer URL mapping in the Electron-main menu
  registry.
- **Always-on-top AI window (Recipe 6).** A new window kind loading
  `/desktop/ai`, same bridge, no editor mounted. V2.x.

## See also

- [Resource loading](./resource-loading.md) — the sibling renderer↔host
  channel: streaming host-owned resource bytes into media elements, not
  invoking capabilities.
- [Process model](./process-model.md) — the agent server the bridge talks to.
- [Security](./agent-security.md) — the five GRIDA-SEC-004 layers.
- [`GRIDA-SEC-004`](https://github.com/gridaco/grida/blob/main/SECURITY.md)
  — the trust boundary the bridge enforces.
- [Sandbox wrap](./agent-sandbox-wrap.md) — defense in depth for
  agent host-spawned children.
