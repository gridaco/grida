import { app, shell, BrowserWindow, Menu, dialog } from "electron";
import { updateElectronApp } from "update-electron-app";
import started from "electron-squirrel-startup";
import create_menu, {
  focus_or_open_canvas_window,
  rebuild_application_menu,
} from "./menu";
import { open_welcome_window, open_document_window } from "./window";
import { EDITOR_BASE_URL } from "./env";
import {
  RUNTIME_APP_NAME,
  USE_DEV_INSIDERS_BRANDING,
  create_runtime_app_icon,
} from "./branding";
import {
  startAgentSidecar,
  getAgentSidecarInfo,
  stopAgentSidecar,
  type AgentSidecarInfo,
} from "./main/agent-sidecar-supervisor";
import { registerIpcHandlers } from "./main/ipc-handlers";
import { disposeAllTerminals } from "./main/terminal-host";
import { disposeAllWorkspaceWatches } from "./main/workspace-watcher-host";
import { agentSidecarClient } from "./main/agent-sidecar-client";
import {
  registerWorkspaceMediaScheme,
  handleWorkspaceMediaProtocol,
} from "./main/workspace-media-protocol";
import { startAgentNotifications } from "./main/agent-notifications";
import { routeDeepLink } from "./main/protocol-router";
import { dirtyState } from "./main/dirty-state";
import { open_handoff } from "./main/open-handoff";

// GRIDA-SEC-004 — single-instance enforcement is acquired in the `ready`
// handler, NOT here at module top. It must run AFTER `open-file` has fired:
// when we are not the *default* handler for an opened type (`.svg` is
// `LSHandlerRank: Alternate` in Info.plist; `.grida` is `Owner`), macOS
// launches a SECOND instance for the file and delivers `open-file` there —
// the running instance never sees it (electron/electron#14029). That
// secondary must forward the captured path to the primary via
// `requestSingleInstanceLock(additionalData)`, which is only possible once
// the path is known. `open-file` is delivered before `ready` for a
// launch-triggered open, so `ready` is the earliest point we can both decide
// primaryhood AND carry the forward. See `open-handoff.ts` + the lock call
// in the `ready` handler below.

// Squirrel-startup is a no-op on macOS/Linux; on Windows it exits the
// process during the install/uninstall handshake.
if (started) {
  app.quit();
}

// #region chrome flags
// Enable GPU optimization
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");

// Optimize rendering & DOM handling
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-low-res-tiling");
app.commandLine.appendSwitch("disable-partial-raster");
app.commandLine.appendSwitch("enable-quic");

// Reduce CPU impact from timers
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-best-effort-tasks");
app.commandLine.appendSwitch("disable-async-dns");

// Improve garbage collection & memory handling
app.commandLine.appendSwitch("js-flags", "--expose-gc");
// #endregion chrome flags

app.setName(RUNTIME_APP_NAME);
app.setAsDefaultProtocolClient("grida");

// GRIDA-SEC-004 — register the `grida-workspace://` privileged media scheme
// (#924). `registerSchemesAsPrivileged` MUST run before `app.whenReady()`; the
// matching `protocol.handle` is installed in the `ready` handler once the
// sidecar is up. See `main/workspace-media-protocol.ts`.
registerWorkspaceMediaScheme();

// `onOpenFile` lets the File ▸ Open… picker route a chosen single file
// through the same handler the OS file-open path uses (dedup + dirty-close
// shared). `handleFilePath` is a hoisted declaration, so it's referenceable
// here even though it's defined further down.
const menu = create_menu(app, shell, { onOpenFile: handleFilePath });
Menu.setApplicationMenu(menu);

// Keep File ▸ Open Recent in sync with the workspace list (the same recents the
// renderer's ⌃R palette shows). Rebuilds are signature-guarded, so firing on
// every window focus is cheap and only re-sets the menu when recents change —
// which catches the auto-create flow (a project made via client-side nav never
// spawns a new window the main process could hook).
function refresh_recent_menu(): void {
  // Swallow-and-log: a failed rebuild (e.g. menu construction throwing) must
  // not become an unhandled rejection in main; the menu just stays stale until
  // the next trigger. (A sidecar that isn't up yet already resolves to an
  // empty recents list inside `rebuild_application_menu`.)
  rebuild_application_menu(app, shell, { onOpenFile: handleFilePath }).catch(
    (err) => console.error("[grida] open-recent menu rebuild failed:", err)
  );
}
app.on("browser-window-focus", refresh_recent_menu);

// `grida://` deep-link router lives in `main/protocol-router.ts`.
// Fire-and-forget from the event handlers below: the deep-link IO is
// async, but Electron's `open-url` / `second-instance` handlers don't
// care about the promise result.

// --- File-open queue (Recipe 4 mechanics) ---------------------------
//
// On macOS, `open-file` may fire before `whenReady`. On Win/Linux the
// path is in `process.argv` of the first instance and in
// `second-instance` for subsequent ones. Queue everything and drain
// on ready.
const pendingFiles: string[] = [];
const pendingDeepLinks: string[] = [];
let deepLinkDrainTimer: NodeJS.Timeout | null = null;

// Live document windows, keyed by agent-server-assigned docId. Used so that
// re-opening an already-open file focuses the existing window instead
// of spawning a duplicate. (The agent server returns the same docId for the
// same normalized path; see `@grida/daemon`'s file registry.)
const documentWindows = new Map<string, BrowserWindow>();

/**
 * Attaches the dirty-close prompt to a document window.
 *
 * V1 ships a 2-button "Don't Save / Cancel" prompt. The 3-button
 * "Save / Don't Save / Cancel" variant needs a main→renderer save
 * request roundtrip (the renderer holds the dirty content, not the
 * agent server) — added when the AI sidebar lands (it needs the same
 * round-trip plumbing anyway).
 *
 * Bypass mechanism: `dirtyState.markForceClose(wcId)` flips a one-shot
 * bit so a programmatic close (e.g. after a clean save) doesn't
 * re-prompt. The bit is consumed inside the `close` handler.
 */
function attach_dirty_close_handler(window: BrowserWindow) {
  const wcId = window.webContents.id;
  window.on("close", (event) => {
    if (dirtyState.takeForceClose(wcId)) return; // user already confirmed
    if (!dirtyState.is(wcId)) return; // clean — proceed
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(window, {
      type: "question",
      buttons: ["Don't Save", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      message: "This document has unsaved changes.",
      detail: "If you don't save, your edits will be lost.",
    });
    if (choice === 0) {
      // Discard — force close on the second pass.
      dirtyState.markForceClose(wcId);
      window.destroy();
    }
    // choice === 1 (Cancel) — leave window open
  });
  window.on("closed", () => {
    dirtyState.forget(wcId);
  });
}

async function openDocumentWindowForPath(filePath: string) {
  if (!agentSidecarInfo) {
    console.warn("[grida] cannot open file: agent sidecar not ready");
    return;
  }
  let docId: string;
  try {
    docId = await agentSidecarClient.registerPath(filePath);
  } catch (err) {
    // Surface, don't silently drop — a dropped open with no feedback is
    // exactly what made the "open while running" bug hard to diagnose.
    console.error("[grida] /files/register failed:", err);
    dialog.showErrorBox(
      "Couldn't open file",
      `Grida couldn't open this file.\n\n${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return;
  }

  // Dedup: same path → same docId → focus existing window.
  const existing = documentWindows.get(docId);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }

  const window = open_document_window({
    app,
    base_url: EDITOR_BASE_URL,
    doc_id: docId,
  });
  documentWindows.set(docId, window);
  attach_dirty_close_handler(window);
  window.on("closed", () => {
    documentWindows.delete(docId);
  });

  // macOS proxy-icon in title bar. Safe to call cross-platform — Electron
  // no-ops on non-darwin.
  window.setRepresentedFilename(filePath);

  // Recent — both OS (Dock right-click / jump list) and the agent server's
  // persistent recent.json. Fire-and-forget; failures are non-fatal.
  app.addRecentDocument(filePath);
  agentSidecarClient.touchRecent(filePath).catch((err) => {
    console.warn("[grida] /recent/touch failed:", err);
  });
}

/**
 * Open a `.canvas` package directory as a slides deck. Unlike a single
 * document (registered by docId), a `.canvas` is a folder: register it as a
 * workspace — the registry respects the opened path as-is, no git-root
 * expansion — and open (or focus) its canvas window.
 */
async function openCanvasBundleForPath(dirPath: string) {
  const agentSidecar = getAgentSidecarInfo();
  if (!agentSidecar) {
    console.warn("[grida] cannot open .canvas: agent sidecar not ready");
    return;
  }
  let workspaceId: string;
  try {
    const workspace = await agentSidecarClient.openWorkspace(dirPath);
    workspaceId = workspace.id;
  } catch (err) {
    console.error("[grida] open .canvas failed:", err);
    dialog.showErrorBox(
      "Couldn't open canvas",
      `Grida couldn't open this canvas.\n\n${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return;
  }
  focus_or_open_canvas_window({ app, agentSidecar, workspace_id: workspaceId });
  app.addRecentDocument(dirPath);
}

function handleFilePath(filePath: string) {
  const isCanvas = open_handoff.isCanvasBundle(filePath);
  if (!isCanvas && !open_handoff.isSupportedFile(filePath)) {
    console.warn("[grida] unsupported file type:", filePath);
    return;
  }
  if (!app.isReady()) {
    pendingFiles.push(filePath);
    return;
  }
  if (isCanvas) void openCanvasBundleForPath(filePath);
  else void openDocumentWindowForPath(filePath);
}

function handleDeepLink(url: string) {
  if (!app.isReady() || !getAgentSidecarInfo()) {
    queueDeepLink(url);
    return;
  }
  void routeDeepLink(url).then((handled) => {
    if (!handled) queueDeepLink(url);
  });
}

function queueDeepLink(url: string) {
  if (!pendingDeepLinks.includes(url)) pendingDeepLinks.push(url);
  scheduleDeepLinkDrain();
}

function scheduleDeepLinkDrain() {
  if (deepLinkDrainTimer) return;
  deepLinkDrainTimer = setTimeout(() => {
    deepLinkDrainTimer = null;
    void drainDeepLinks();
  }, 500);
}

async function drainDeepLinks() {
  if (!app.isReady() || !getAgentSidecarInfo()) {
    if (pendingDeepLinks.length > 0) scheduleDeepLinkDrain();
    return;
  }
  const batch = pendingDeepLinks.splice(0);
  for (const url of batch) {
    const handled = await routeDeepLink(url);
    if (!handled) pendingDeepLinks.push(url);
  }
  if (pendingDeepLinks.length > 0) scheduleDeepLinkDrain();
}

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  handleFilePath(filePath);
});

// Also pick up file args from the first-instance command line (Win/Linux).
// macOS delivers the opened document via `open-file` (above), not argv.
for (const open of open_handoff.fromArgv(process.argv)) {
  if (open.kind === "url") pendingDeepLinks.push(open.url);
  else pendingFiles.push(open.path);
}

app.on("second-instance", (_event, argv, _workingDirectory, additionalData) => {
  // Focus an existing window so the user knows we routed the request.
  const existing = BrowserWindow.getAllWindows()[0];
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
  }
  // Prefer the forwarded `additionalData` — the secondary's captured opens.
  // This is the ONLY reliable channel on macOS, where the opened document
  // never appears in the second instance's argv (it arrives as an `open-file`
  // Apple Event the secondary collects, then forwards from its `ready`).
  // Fall back to parsing argv for the Win/Linux command-line case.
  const forwarded = open_handoff.decode(additionalData);
  const opens = forwarded.length > 0 ? forwarded : open_handoff.fromArgv(argv);
  for (const open of opens) {
    if (open.kind === "url") handleDeepLink(open.url);
    else handleFilePath(open.path);
  }
});

// macOS deep-link arrival.
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// agent sidecar info is set once on ready; stays in scope for `activate`,
// menu actions, and the file-handle path. The supervisor maintains
// the live reference internally for restart-on-crash continuity.
let agentSidecarInfo: AgentSidecarInfo | null = null;

app.on("ready", async () => {
  // GRIDA-SEC-004 — single-instance enforcement (deferred from module top;
  // see the comment near the imports). By `ready`, any launch-triggered
  // `open-file`/`open-url` has populated the pending queues, so a SECONDARY
  // instance forwards them to the primary via `additionalData` and quits here
  // — before starting a second sidecar or opening any window. The primary's
  // `second-instance` handler routes the forward.
  const isPrimary = app.requestSingleInstanceLock(
    open_handoff.encode([
      ...pendingFiles.map((path) => ({ kind: "file", path }) as const),
      ...pendingDeepLinks.map((url) => ({ kind: "url", url }) as const),
    ])
  );
  if (!isPrimary) {
    app.quit();
    return;
  }

  // Primary-only: auto-update checks should never run in a secondary that is
  // about to quit.
  updateElectronApp({ notifyUser: true });

  if (USE_DEV_INSIDERS_BRANDING && process.platform === "darwin") {
    app.dock?.setIcon(create_runtime_app_icon());
  }

  // Native-OS IPC handlers are needed before any window opens —
  // otherwise the renderer's first bridge call races the registration.
  registerIpcHandlers();

  try {
    agentSidecarInfo = await startAgentSidecar();
    console.log(
      `[grida] agent sidecar ready on 127.0.0.1:${agentSidecarInfo.port}`
    );
    // Desktop notifications on turn-finish / pending-approval (RFC
    // `events.md` §the first consumer). Main-owned so a turn with no
    // renderer attached (queue drain, closed window) still notifies.
    startAgentNotifications();
    // Now that the sidecar is up, serve `grida-workspace://` media requests by
    // proxying to its streamed `/workspaces/file` route (#924).
    handleWorkspaceMediaProtocol();
  } catch (err) {
    console.error("[grida] agent sidecar failed to start:", err);
    dialog.showErrorBox(
      "Grida couldn't start",
      "The Grida agent sidecar failed to start. Please relaunch the app or report this issue."
    );
    app.quit();
    return;
  }

  open_welcome_window({
    app,
    base_url: EDITOR_BASE_URL,
  });

  // Populate File ▸ Open Recent now that the sidecar can answer `workspaces.list`
  // (the module-top menu was built before it was up).
  refresh_recent_menu();

  // Drain anything that arrived before ready. `splice(0)` clears the
  // queue atomically so any `open-file` event firing during the drain
  // (the handler now sees `app.isReady() === true`) doesn't get
  // re-handled, and we avoid the O(n²) of repeated `shift()`.
  for (const f of pendingFiles.splice(0)) {
    handleFilePath(f);
  }
  void drainDeepLinks();
});

app.on("window-all-closed", () => {
  // macOS keeps the app alive (`activate` re-opens a window); Win/Linux quit.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && agentSidecarInfo) {
    open_welcome_window({
      app,
      base_url: EDITOR_BASE_URL,
    });
  }
});

app.on("before-quit", () => {
  // Belt-and-suspenders — supervisor also listens for this event, and
  // terminal PTYs / workspace watches are also torn down per-window on
  // webContents teardown.
  stopAgentSidecar();
  disposeAllTerminals();
  void disposeAllWorkspaceWatches();
});
