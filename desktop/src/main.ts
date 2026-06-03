import { app, shell, BrowserWindow, Menu, dialog } from "electron";
import { updateElectronApp } from "update-electron-app";
import started from "electron-squirrel-startup";
import path from "node:path";
import create_menu from "./menu";
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
import { agentSidecarClient } from "./main/agent-sidecar-client";
import { routeDeepLink } from "./main/protocol-router";
import { dirtyState } from "./main/dirty-state";

// GRIDA-SEC-004 — single-instance lock is the FIRST statement.
// If another instance already holds it, this process exits immediately
// so the running instance can pick up any deep links or file-open
// arguments (`open-file` on macOS, argv on Win/Linux) through its
// `second-instance` handler.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

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

updateElectronApp({ notifyUser: true });

app.setName(RUNTIME_APP_NAME);
app.setAsDefaultProtocolClient("grida");

const menu = create_menu(app, shell);
Menu.setApplicationMenu(menu);

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
// same normalized path; see `@grida/agent`'s file registry.)
const documentWindows = new Map<string, BrowserWindow>();

function isSupportedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".svg" || ext === ".grida";
}

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
    console.error("[grida] /files/register failed:", err);
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

function handleFilePath(filePath: string) {
  if (!isSupportedFile(filePath)) {
    console.warn("[grida] unsupported file type:", filePath);
    return;
  }
  if (app.isReady()) {
    void openDocumentWindowForPath(filePath);
  } else {
    pendingFiles.push(filePath);
  }
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
for (const arg of process.argv.slice(1)) {
  if (arg.startsWith("grida://")) pendingDeepLinks.push(arg);
  if (isSupportedFile(arg)) pendingFiles.push(arg);
}

app.on("second-instance", (_event, commandLine) => {
  // Focus an existing window so the user knows we routed the request.
  const existing = BrowserWindow.getAllWindows()[0];
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
  }
  // Last argv element is typically the deep link or file path.
  const last = commandLine[commandLine.length - 1];
  if (!last) return;
  if (last.startsWith("grida://")) {
    handleDeepLink(last);
    return;
  }
  if (isSupportedFile(last)) {
    handleFilePath(last);
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
  // Belt-and-suspenders — supervisor also listens for this event.
  stopAgentSidecar();
});
