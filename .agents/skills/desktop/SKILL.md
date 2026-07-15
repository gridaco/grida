---
name: desktop
description: >-
  Grida Desktop Electron shell and release-impact work: BrowserWindow, preload,
  `window.grida`, menus, protocol/deep links, file associations, Forge,
  path-scoped bridge security, Electron-only UI bugs, and CDP / Playwright
  verification. Use for `desktop/`, `editor/app/desktop/**`,
  `editor/scaffolds/desktop/**`, `editor/lib/desktop/**`, `/desktop/*` CSP,
  GRIDA-SEC-004, and deciding whether linked-package or hosted-renderer changes
  require a native Desktop version bump or coordinated release. For implementing
  daemon/agent-tenant core behavior, use `agent-system` as well.
---

# Grida Desktop - Electron Shell

This skill is for the Electron shell only: main process, windows, menus,
preload, native protocol/file entry points, and the renderer bridge surface.
The renderer is still the editor's Next.js app under `editor/app/desktop/`;
Electron URL-loads it from `http://localhost:3000/desktop/*` in dev and
`https://grida.co/desktop/*` in prod.

Use [`agent-system`](../agent-system/SKILL.md) for the daemon + agent-tenant core,
sessions, workspaces, providers, tool execution, HTTP routes, and tests in
`packages/grida-daemon` and `packages/grida-ai-agent`.

> Adjacent: [`security`](../security/SKILL.md) for the GRIDA-SEC-004 trust
> boundary, [`code-react`](../code-react/SKILL.md) for React code under
> `editor/app/desktop/**` and `editor/scaffolds/desktop/**`.

## When to use this skill

- Editing `desktop/src/**`, `desktop/forge.config.ts`, `desktop/Info.plist`,
  or desktop packaging/dev-server wiring.
- Changing `desktop/src/main.ts`, `window.ts`, `menu.ts`, preload, bridge
  contract, app branding, host-app integration, deep links, file associations,
  single-instance behavior, or multi-window routing.
- Touching `editor/app/desktop/**`, `editor/scaffolds/desktop/**`, or
  `editor/lib/desktop/**` because the UI depends on `window.grida`.
- Debugging "works in browser but not in desktop" or "only repros in
  Electron" issues.
- Verifying the desktop app through CDP / Playwright.
- Touching CSP or proxy behavior for `/desktop/*`.
- Auditing whether linked-package or hosted Desktop renderer changes require a
  native version bump or coordinated release.

Use `agent-system` to implement core agent behavior that can be tested without
Electron: `packages/grida-daemon/**`, `packages/grida-ai-agent/**`, daemon HTTP
routes, sessions, files/workspaces, providers, tools, runtime, skills, and
BYOK/secrets. Also use this skill when auditing whether that work changes the
packaged Desktop payload or its compatibility with the hosted renderer.

---

## Shape

```
Electron main (desktop/src/main.ts)
  - single-instance lock
  - BrowserWindow.loadURL(`${EDITOR_BASE_URL}/desktop/welcome`)
  - grida:// protocol router, open-file/argv queue
  - starts/supervises the AgentSidecar adapter
        |
        | contextBridge.exposeInMainWorld("grida", ...)
        | only for /desktop or /desktop/*
        v
Renderer (editor/app/desktop/**)
  - DesktopBridgeGate renders desktop UI only when bridge is present
  - web visitors get OpenInDesktopCta
  - CSP strict, no analytics, no third-party scripts
        |
        v
AgentSidecar loopback service
  - owned by the agent-system skill
```

Four invariants:

1. `pnpm dev` in `desktop/` does not serve the renderer. Run the editor dev
   server on `:3000` separately.
2. The preload is path-scoped. Outside `/desktop/*`, `window.grida` is
   intentionally undefined.
3. Keep `contextIsolation: true`, `nodeIntegration: false`, and
   `sandbox: true`.
4. Electron code adapts and supervises native shell behavior. Core behavior
   that can be tested without Electron belongs in `agent-system`.

---

## Running Locally

Use two terminals:

```sh
# Terminal 1 - renderer
pnpm --filter editor dev

# Terminal 2 - Electron shell
cd desktop && pnpm dev
# Insiders build:
cd desktop && pnpm dev -- --insiders
```

`EDITOR_BASE_URL` lives in `desktop/src/env.ts`. It resolves to
`http://localhost:3000` in development and `https://grida.co` otherwise.

`electron-forge start` can return the shell prompt while Electron stays alive.
Confirm with:

```sh
lsof -iTCP:9222 -sTCP:LISTEN
ps -A | grep grida/desktop/node_modules/electron
```

Kill cleanly:

```sh
pkill -f "grida/desktop/node_modules/electron"
pkill -f "grida/desktop/node_modules/.bin/electron-forge"
```

---

## CDP / Playwright Verification

Launch with CDP enabled:

```sh
cd desktop && pnpm dev -- --remote-debugging-port=9222
```

The `--` is required so Forge forwards the flag to Electron.

Probe targets:

```sh
curl -s http://127.0.0.1:9222/json/version
curl -s http://127.0.0.1:9222/json
```

Preferred client:

- One-off probe: direct CDP with Node's built-in `WebSocket` and `fetch`.
- Scripted verification: `chromium.connectOverCDP("http://127.0.0.1:9222")`.
- Owned Electron lifecycle or native menus/dialogs: Playwright `_electron`
  plus `electron-playwright-helpers`.

Minimal probe:

```js
import { chromium } from "playwright-core";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages()[0];
console.log("url:", page.url());
console.log("hasBridge:", await page.evaluate(() => typeof window.grida));
await page.screenshot({ path: "/tmp/grida-desktop.png" });
await browser.close();
```

If `playwright-core` does not resolve at repo root, run the probe from
`editor/`, import the package from pnpm's `.pnpm` path, or add Playwright to
`desktop/package.json`.

Inspect main process:

```sh
cd desktop && pnpm dev -- --inspect-electron
```

Then open `chrome://inspect/#devices`, add `localhost:5858`, and inspect.

---

## Bridge

The renderer's native-capability surface is the typed client in
`editor/lib/desktop/bridge.ts`. React code reads it via `useDesktopBridge()`,
an SSR-safe `useSyncExternalStore` wrapper.

Hard gate:

```tsx
const bridge = useDesktopBridge();
if (!bridge) return null;
return <Button onClick={() => bridge.dialog.open(...)} />;
```

Soft branch:

```tsx
const bridge = useDesktopBridge();
const onSave = bridge
  ? () => bridge.files.write(docId, svg)
  : () => downloadAsBlob(svg);
```

`DesktopBridgeGate` in `editor/scaffolds/desktop/` gates whole desktop pages.

Verify from CDP:

```js
await page.evaluate(() => ({
  bridge: typeof window.grida,
  version: window.grida?.app?.version,
  caps: window.grida?.caps,
}));
```

The preload runs after Next.js streams the first HTML. A screenshot taken
immediately after load can catch the temporary CTA before hydration observes
`window.grida`; wait for a post-hydration element or a short timeout before
judging the bridge state.

---

## Boundaries

| Concern                   | Lives in                                              | Notes                                                                 |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| Window/menu/dialog wiring | `desktop/src/main/**`                                 | Native shell behavior                                                 |
| Protocol and file routing | `desktop/src/main/**`, `desktop/Info.plist`           | `grida://` (prod) / `grida-dev://` (dev, #955), open-file, argv queue |
| Agent sidecar supervision | `desktop/src/main/**`, `desktop/src/agent-sidecar.ts` | Adapter only; core is `agent-system`                                  |
| Preload bridge            | `desktop/src/preload.ts`                              | Path-scoped `window.grida`, auth held in closure                      |
| Renderer desktop routes   | `editor/app/desktop/**`                               | No server actions, no `next/headers`                                  |
| Renderer scaffolds        | `editor/scaffolds/desktop/**`                         | UI using `@/lib/desktop/*`                                            |
| Typed bridge client       | `editor/lib/desktop/**`                               | Pure TS client, no server-only imports                                |

Do not put OPFS or IndexedDB desktop storage in `editor/app/desktop/**`.
Desktop storage goes through the bridge and agent host.

Do not add core behavior in Electron main/preload. If it is testable without
Electron, move it to the agent-system package.

---

## Security Boundary: GRIDA-SEC-004

When changing the bridge or navigation rules, review `SECURITY.md` and the
`security` skill. The relevant desktop layers are:

1. Path-scoped preload: `window.grida` only on `/desktop` or `/desktop/*` at
   document load time.
2. Navigation allowlist in `desktop/src/window.ts`.
3. CSP-strict `/desktop/*` route group.
4. Per-launch bridge credentials held in the preload closure, never exposed on
   `window.grida`.
5. No bridge method may exfiltrate secrets or run arbitrary local code.

---

## Release impact and versioning

Production Desktop has two independently shipped halves: the renderer loaded
from `https://grida.co/desktop/*`, and the native app containing Electron plus
the bundled daemon/agent sidecar. A change can require a Desktop release
without touching `desktop/src/**`.

At the start and before handoff, run the bundled audit from the repository
root. It reports the release-scoped diff, uncommitted paths, and whether the
current Desktop version already has a GitHub release:

```sh
.agents/skills/desktop/scripts/audit-release-impact.sh
```

Decide from the shipped boundary, not the directory name:

- A change to `desktop/**`, `skills/**`, or a linked package reported by the
  audit changes the native payload. Bump `desktop/package.json` before
  publishing a new native build when its current `v<version>` is already
  published, including as a prerelease. The release assembler deliberately
  refuses to modify any published release.
- A renderer-only change needs no native version bump when it remains
  compatible with the latest published sidecar.
- A release workflow or assembler change is release-impacting but does not by
  itself change the native payload; review its version/tag semantics directly.
- A renderer change that sends a new model id, provider id, protocol field,
  route, or bridge call that the published sidecar rejects is release-coupled.
  Compare the validation code at the published tag and bump the Desktop
  version, but block the incompatible hosted behavior until affected clients
  are required to run that compatible version. Publishing or auto-update
  notification alone does not update installed clients.

When the scoped diff is non-empty, record one line in the PR description or
handoff: `Desktop release impact: none`, `Desktop release impact: version bump
included`, or `Desktop release impact: follow-up release required`.

---

## Verification

For non-trivial desktop changes:

1. Run both the editor dev server and Electron shell.
2. Use CDP / Playwright to touch the changed surface.
3. Cold reload or relaunch Electron once to exercise preload and hydration.
4. Run owner checks:
   - Electron adapter: `pnpm --dir desktop typecheck` and
     `pnpm --dir desktop test`.
   - Renderer desktop UI: `pnpm --filter editor typecheck`.
   - Agent core changes: switch to `agent-system`.

---

## Pointers

- Electron main: `desktop/src/main.ts`
- Window and navigation policy: `desktop/src/window.ts`
- Preload bridge: `desktop/src/preload.ts`
- Forge config: `desktop/forge.config.ts`
- File associations: `desktop/Info.plist`
- Deep-link scheme + router: `desktop/src/env.ts` (`DEEP_LINK_SCHEME`) + `desktop/src/main/protocol-router.ts` — per-environment `grida://` (prod) / `grida-dev://` (dev + insiders), so a dev build never fights an installed prod Grida over one OS handler. Dev registration is `CFBundleURLTypes` via `scripts/prepare-dev-electron-branding.mjs` (macOS `setAsDefaultProtocolClient` no-ops unpackaged). Full context: #955.
- Renderer routes: `editor/app/desktop/`
- Renderer scaffolds: `editor/scaffolds/desktop/`
- Typed bridge client: `editor/lib/desktop/bridge.ts`
- CSP for `/desktop/*`: `editor/proxy.ts`
- Threat model: `SECURITY.md` (`GRIDA-SEC-004` bridge · `GRIDA-SEC-005` sign-in deep link)
