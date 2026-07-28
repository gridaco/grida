// GRIDA-SEC-008 — close the main-owned OAuth callback before sidecar shutdown.
import { app, shell, BrowserWindow, Menu, dialog, session } from "electron";
import path from "node:path";
import { updateElectronApp } from "update-electron-app";
import started from "electron-squirrel-startup";
import create_menu, {
  focus_or_open_canvas_window,
  rebuild_application_menu,
} from "./menu";
import { open_document_window } from "./window";
import { DEEP_LINK_SCHEME, EDITOR_BASE_URL } from "./env";
import {
  RUNTIME_APP_NAME,
  USE_DEV_INSIDERS_BRANDING,
  create_runtime_app_icon,
} from "./branding";
import {
  startAgentSidecar,
  getAgentSidecarInfo,
  stopAgentSidecar,
  approveAgentProviderEndpoint,
  describeAgentProviderEndpoint,
  type AgentSidecarInfo,
} from "./main/agent-sidecar-supervisor";
import { closeChatGptOAuth, registerIpcHandlers } from "./main/ipc-handlers";
import { disposeAllTerminals } from "./main/terminal-host";
import { disposeAllWorkspaceWatches } from "./main/workspace-watcher-host";
import { agentSidecarClient } from "./main/agent-sidecar-client";
import {
  registerWorkspaceMediaScheme,
  handleWorkspaceMediaProtocol,
} from "./main/workspace-media-protocol";
import { startAgentNotifications } from "./main/agent-notifications";
import { protocol_router } from "./main/protocol-router";
import { dirtyState } from "./main/dirty-state";
import { open_handoff } from "./main/open-handoff";
import { startup_window } from "./main/startup-window-policy";
import { DesktopAccountSession } from "./main/account-session";
import { DesktopEntryWindow } from "./main/desktop-entry-window";
import { DesktopPreferences } from "./main/desktop-preferences";

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
// GRIDA-SEC-005 / #955 — register this build's channel-specific deep-link scheme
// (`grida-dev` for local builds, `grida` for production) so dev and an installed
// production Grida don't fight over one scheme. On macOS the reliable, declarative
// registration is the dev bundle's CFBundleURLTypes (dev: prepare-dev-electron-
// branding.mjs; packaged: forge.config `protocols`); this runtime call is the
// Windows/Linux path and a macOS best-effort.
if (process.defaultApp && process.argv.length >= 2) {
  // Dev (`electron-forge start` → `process.defaultApp`): the one-arg form would
  // register the bare Electron executable WITHOUT our app entry, so on Windows a
  // `grida-dev://` deep link could relaunch a blank Electron instead of delivering
  // the URL. Point the registration at the app entry (Electron's documented dev
  // pattern: setAsDefaultProtocolClient(scheme, execPath, [appPath])).
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [
    path.resolve(process.argv[1]),
  ]);
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
}

// GRIDA-SEC-004 — register the `grida-workspace://` privileged media scheme
// (#924). `registerSchemesAsPrivileged` MUST run before `app.whenReady()`; the
// matching `protocol.handle` is installed in the `ready` handler once the
// sidecar is up. See `main/workspace-media-protocol.ts`.
registerWorkspaceMediaScheme();

// The one canonical BrowserWindow that owns boot → sign-in → onboarding →
// main. Auxiliary document/settings/workspace windows are admitted and
// registered through this controller only after it reaches `main`.
let entryWindow: DesktopEntryWindow | null = null;
const windowAdmission = {
  can_open: () => entryWindow?.isMain ?? false,
  register: (window: BrowserWindow) => {
    if (entryWindow) return entryWindow.registerSecondary(window);
    window.close();
    return false;
  },
  focus_entry: () => {
    if (!entryWindow) return;
    if (entryWindow.window) {
      entryWindow.focus();
      return;
    }
    void entryWindow.reconcile({ focus: true }).catch((error) => {
      console.warn("[grida] couldn't reopen entry window:", error);
    });
  },
};

/**
 * Let Electron serialize the current invoke result before disposing its
 * sender. Controller role admission has already been revoked synchronously,
 * so the hidden renderer cannot spend another native capability in this gap.
 */
function destroyAfterIpcReply(window: BrowserWindow): void {
  setTimeout(() => {
    if (!window.isDestroyed()) window.destroy();
  }, 0);
}

app.on("web-contents-created", (_event, contents) => {
  const reconcileContainedAuthControl = (rawUrl: string) => {
    const path = DesktopEntryWindow.authControlPathForUrl(
      rawUrl,
      EDITOR_BASE_URL
    );
    if (!path) return;

    const controller = entryWindow;
    const source = BrowserWindow.fromWebContents(contents);
    if (!controller || !source) return;

    // A contained auth navigation is only a signal to re-probe the cookie
    // session; the URL itself never grants or selects a native role. Hide the
    // source immediately so an auxiliary/main-sized sign-in page cannot become
    // a competing entry surface while the serialized probe runs. Both full
    // loads and Next.js same-document transitions reach this one path.
    source.hide();
    void controller.reconcileAuthControlNavigation(source, path).catch(() => {
      console.warn("[grida] account-navigation revalidation unavailable");
      // Unavailable is not signed-out authority. Restore the one canonical
      // window instead of leaving the app hidden. Controller admission remains
      // fail-closed until a later authoritative probe validates the role.
      controller.focus();
    });
  };

  contents.on("did-navigate", (_navigationEvent, rawUrl) => {
    reconcileContainedAuthControl(rawUrl);
  });
  contents.on(
    "did-navigate-in-page",
    (_navigationEvent, rawUrl, isMainFrame) => {
      if (isMainFrame) reconcileContainedAuthControl(rawUrl);
    }
  );
});

// `onOpenFile` lets the File ▸ Open… picker route a chosen single file
// through the same handler the OS file-open path uses (dedup + dirty-close
// shared). `handleFilePath` is a hoisted declaration, so it's referenceable
// here even though it's defined further down.
const menu = create_menu(app, shell, {
  onOpenFile: handleFilePath,
  windowAdmission,
});
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
  rebuild_application_menu(app, shell, {
    onOpenFile: handleFilePath,
    windowAdmission,
  }).catch((err) =>
    console.error("[grida] open-recent menu rebuild failed:", err)
  );
}
let accountRevalidationTimer: NodeJS.Timeout | null = null;
app.on("browser-window-focus", () => {
  refresh_recent_menu();
  if (
    !entryWindow ||
    entryWindow.role === "booting" ||
    accountRevalidationTimer
  ) {
    return;
  }
  accountRevalidationTimer = setTimeout(() => {
    accountRevalidationTimer = null;
    void entryWindow?.reconcile().catch((error) => {
      // A transient account-status outage must not be treated as sign-out.
      console.warn("[grida] account revalidation unavailable:", error);
    });
  }, 250);
});

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
const pendingAuthCallbacks: string[] = [];

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

  // Registration above is asynchronous. Authentication or onboarding may
  // have changed while it was in flight; queue rather than letting a late
  // document window escape the entry admission gate.
  if (!entryWindow?.isMain) {
    if (!pendingFiles.includes(filePath)) pendingFiles.push(filePath);
    return;
  }

  const window = open_document_window({
    app,
    base_url: EDITOR_BASE_URL,
    doc_id: docId,
  });
  if (!entryWindow.registerSecondary(window)) return;
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
  if (!entryWindow?.isMain) {
    if (!pendingFiles.includes(dirPath)) pendingFiles.push(dirPath);
    return;
  }
  focus_or_open_canvas_window({
    app,
    agentSidecar,
    workspace_id: workspaceId,
    admission: windowAdmission,
  });
  app.addRecentDocument(dirPath);
}

function handleFilePath(filePath: string) {
  const isCanvas = open_handoff.isCanvasBundle(filePath);
  if (!isCanvas && !open_handoff.isSupportedFile(filePath)) {
    console.warn("[grida] unsupported file type:", filePath);
    return;
  }
  if (
    !agentSidecarInfo ||
    !startup_window.canDispatchLaunchIntent({
      app_ready: app.isReady(),
      entry_main: entryWindow?.isMain ?? false,
    })
  ) {
    if (!pendingFiles.includes(filePath)) pendingFiles.push(filePath);
    return;
  }
  if (isCanvas) void openCanvasBundleForPath(filePath);
  else void openDocumentWindowForPath(filePath);
}

async function handleDeepLink(url: string): Promise<void> {
  const route = protocol_router.route(url);
  if (route.kind === "ignored") return;
  if (!app.isReady() || !entryWindow) {
    if (!pendingAuthCallbacks.includes(url)) pendingAuthCallbacks.push(url);
    return;
  }
  const completed = await runEntryOperationWithRetry(async () => {
    await entryWindow?.handleAuthCallback(route.callback_url);
  });
  if (!completed) {
    app.quit();
  }
}

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  handleFilePath(filePath);
});

// Also pick up file args from the first-instance command line (Win/Linux).
// macOS delivers the opened document via `open-file` (above), not argv.
for (const open of open_handoff.fromArgv(process.argv)) {
  if (open.kind === "url") pendingAuthCallbacks.push(open.url);
  else pendingFiles.push(open.path);
}

app.on("second-instance", (_event, argv, _workingDirectory, additionalData) => {
  // Focus the controller-owned entry window, never an arbitrary Settings or
  // document window.
  entryWindow?.focus();
  // Prefer the forwarded `additionalData` — the secondary's captured opens.
  // This is the ONLY reliable channel on macOS, where the opened document
  // never appears in the second instance's argv (it arrives as an `open-file`
  // Apple Event the secondary collects, then forwards from its `ready`).
  // Fall back to parsing argv for the Win/Linux command-line case.
  const forwarded = open_handoff.decode(additionalData);
  const opens = forwarded.length > 0 ? forwarded : open_handoff.fromArgv(argv);
  for (const open of opens) {
    if (open.kind === "url") void handleDeepLink(open.url);
    else handleFilePath(open.path);
  }
});

// macOS deep-link arrival.
app.on("open-url", (event, url) => {
  event.preventDefault();
  void handleDeepLink(url);
});

// agent sidecar info is set once on ready; stays in scope for `activate`,
// menu actions, and the file-handle path. The supervisor maintains
// the live reference internally for restart-on-crash continuity.
let agentSidecarInfo: AgentSidecarInfo | null = null;
let providerApprovalStarted = false;

function approveConfiguredProviderEndpointsWhenReady(): void {
  if (providerApprovalStarted || !agentSidecarInfo || !entryWindow?.isMain) {
    return;
  }
  providerApprovalStarted = true;
  void approveConfiguredProviderEndpoints().catch((error) => {
    console.error("[grida] configured provider approval failed:", error);
  });
}

function dispatchPendingLaunchIntents(): void {
  for (const filePath of pendingFiles.splice(0)) {
    handleFilePath(filePath);
  }
}

async function dispatchPendingAuthCallbacks(): Promise<void> {
  for (const url of pendingAuthCallbacks.splice(0)) {
    await handleDeepLink(url);
  }
}

async function openEntryWindowWithRetry(
  initialAuthUrl?: string
): Promise<boolean> {
  if (!entryWindow) return false;
  let callbackUrl: string | undefined;
  if (initialAuthUrl) {
    const route = protocol_router.route(initialAuthUrl);
    if (route.kind === "auth-callback") callbackUrl = route.callback_url;
  }
  return await runEntryOperationWithRetry(async () => {
    if (callbackUrl) {
      // Keep the same bounded callback intent until the controller succeeds.
      // PKCE codes are single-use, so a processed replay still fails safe and
      // the subsequent account probe remains authoritative.
      await entryWindow?.handleAuthCallback(callbackUrl);
      callbackUrl = undefined;
    } else {
      await entryWindow?.open();
    }
  });
}

async function runEntryOperationWithRetry(
  operation: () => Promise<void>
): Promise<boolean> {
  for (;;) {
    try {
      await operation();
      return true;
    } catch {
      // Never inspect/log account callback errors: Electron navigation errors
      // may contain the single-use code in their URL.
      console.error("[grida] account entry operation unavailable");
      const result = await dialog.showMessageBox({
        type: "warning",
        message: "Grida couldn't connect",
        detail:
          "Check your internet connection, then try again. Your account has not been signed out.",
        buttons: ["Try Again", "Quit"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (result.response !== 0) return false;
    }
  }
}

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
      ...pendingAuthCallbacks.map((url) => ({ kind: "url", url }) as const),
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

  const startupBootstrap = startup_window.bootstrap({
    pending_files: pendingFiles.length,
  });
  const accountSession = new DesktopAccountSession({
    base_url: EDITOR_BASE_URL,
    fetch: async (url, init) =>
      (await session.defaultSession.fetch(url, init)) as Response,
  });
  let desktopPreferences: DesktopPreferences;
  try {
    desktopPreferences = await DesktopPreferences.open({
      user_data_path: app.getPath("userData"),
    });
  } catch {
    console.error("[grida] desktop preferences could not be read");
    dialog.showErrorBox(
      "Grida couldn't start",
      "Desktop preferences could not be read. Check that Grida can access its application data, then relaunch the app."
    );
    app.quit();
    return;
  }
  let markAuthenticatedEntryReady!: () => void;
  const authenticatedEntryReady = new Promise<void>((resolve) => {
    markAuthenticatedEntryReady = resolve;
  });
  entryWindow = new DesktopEntryWindow({
    app,
    base_url: EDITOR_BASE_URL,
    account: accountSession,
    preferences: desktopPreferences,
    startup_main_path:
      startupBootstrap === "restore-last-workspace"
        ? "/desktop/welcome?startup=restore-last-workspace"
        : "/desktop/welcome",
    before_authenticated_entry: async () => {
      await authenticatedEntryReady;
    },
    clear_hosted_session: async () => {
      await agentSidecarClient.clearGridaGatewaySession();
    },
    on_role_change: (role) => {
      refresh_recent_menu();
      if (role === "main") {
        approveConfiguredProviderEndpointsWhenReady();
        dispatchPendingLaunchIntents();
      }
    },
  });

  // Native-OS IPC handlers are needed before any window opens —
  // otherwise the renderer's first bridge call races the registration.
  registerIpcHandlers({
    resolve_ipc_role: (window) => entryWindow?.ipcRoleFor(window) ?? null,
    on_onboarding_complete: async ({ window, workspace_id: workspaceId }) => {
      try {
        await entryWindow?.completeOnboarding(window, workspaceId);
      } catch {
        const recovered = await runEntryOperationWithRetry(async () => {
          await entryWindow?.reconcile({ focus: true });
        });
        if (!recovered) app.quit();
        throw new Error("onboarding completion could not be finalized");
      }
    },
    on_account_sign_out: async ({ window }) => {
      if (!entryWindow) throw new Error("entry window is unavailable");
      let result: { close_sender_after_reply: boolean };
      try {
        result = await entryWindow.signOut(window);
      } catch (error) {
        if (error instanceof DesktopEntryWindow.SignOutCancelledError) {
          throw error;
        }
        const recovered = await runEntryOperationWithRetry(async () => {
          await entryWindow?.reconcile({ focus: true });
        });
        if (!recovered) app.quit();
        if (
          recovered &&
          entryWindow?.role === "sign-in" &&
          window !== entryWindow.window
        ) {
          destroyAfterIpcReply(window);
        }
        throw new Error("account sign-out could not be finalized");
      }
      if (result.close_sender_after_reply) {
        destroyAfterIpcReply(window);
      }
    },
  });

  // Start the local sidecar in parallel, but do not let it—or provider
  // approval UI—sit in front of the required Grida account entry flow.
  const sidecarStartup = (async (): Promise<boolean> => {
    try {
      agentSidecarInfo = await startAgentSidecar();
      console.log(
        `[grida] agent sidecar ready on 127.0.0.1:${agentSidecarInfo.port}`
      );
      // Desktop notifications on turn-finish / pending-approval (RFC
      // `events.md` §the first consumer). Main-owned so a turn with no
      // renderer attached (queue drain, closed window) still notifies.
      startAgentNotifications(windowAdmission);
      // Now that the sidecar is up, serve `grida-workspace://` media requests
      // by proxying to its streamed `/workspaces/file` route (#924).
      handleWorkspaceMediaProtocol();
      markAuthenticatedEntryReady();
      return true;
    } catch (err) {
      console.error("[grida] agent sidecar failed to start:", err);
      dialog.showErrorBox(
        "Grida couldn't start",
        "The Grida agent sidecar failed to start. Please relaunch the app or report this issue."
      );
      app.quit();
      return false;
    }
  })();

  // A cold-start callback enters through the hidden controller window before
  // any ordinary role is shown, avoiding a sign-in flash between the system
  // browser and the authenticated destination.
  const initialAuthCallback = pendingAuthCallbacks.shift();
  if (!(await openEntryWindowWithRetry(initialAuthCallback))) {
    app.quit();
    return;
  }

  if (!(await sidecarStartup)) return;

  // Populate File ▸ Open Recent now that the sidecar can answer `workspaces.list`
  // (the module-top menu was built before it was up).
  refresh_recent_menu();
  approveConfiguredProviderEndpointsWhenReady();

  // Account callbacks are control-plane events: drain them independently of
  // onboarding/work admission. Work files drain from the controller's `main`
  // transition.
  await dispatchPendingAuthCallbacks();
  if (entryWindow.isMain) {
    dispatchPendingLaunchIntents();
  }
});

async function approveConfiguredProviderEndpoints(): Promise<void> {
  const endpoints = await agentSidecarClient.listProviderEndpoints();
  if (endpoints.length === 0) return;
  const rows: Array<{
    id: string;
    baseUrl: string;
    origin: string;
    route: string;
  }> = [];
  const withheld: string[] = [];
  for (const endpoint of endpoints) {
    try {
      rows.push({
        id: endpoint.id,
        baseUrl: endpoint.base_url,
        ...(await describeAgentProviderEndpoint(endpoint.base_url)),
      });
    } catch (error) {
      withheld.push(
        `${endpoint.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (withheld.length > 0) {
    await dialog.showMessageBox({
      type: "warning",
      message: "Some AI provider endpoints are unavailable",
      detail: withheld.join("\n"),
      buttons: ["Continue"],
      defaultId: 0,
      noLink: true,
    });
  }
  if (rows.length === 0) return;
  const result = await dialog.showMessageBox({
    type: "warning",
    message: "Allow configured AI provider endpoints?",
    detail:
      rows.map((row) => `${row.id}: ${row.origin}\n  ${row.route}`).join("\n") +
      "\n\nThese exact origins will be available to provider requests until Grida closes.",
    buttons: ["Allow", "Not Now"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (result.response !== 0) return;
  for (const row of rows) {
    await approveAgentProviderEndpoint(row.id, row.baseUrl);
  }
}

app.on("window-all-closed", () => {
  // macOS keeps the app alive (`activate` re-opens a window); Win/Linux quit.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (!agentSidecarInfo || !entryWindow) return;
  void entryWindow.reconcile({ focus: true }).catch((error) => {
    console.warn("[grida] account revalidation failed:", error);
    entryWindow?.focus();
  });
});

app.on("before-quit", () => {
  // Belt-and-suspenders — supervisor also listens for this event, and
  // terminal PTYs / workspace watches are also torn down per-window on
  // webContents teardown.
  closeChatGptOAuth();
  stopAgentSidecar();
  disposeAllTerminals();
  void disposeAllWorkspaceWatches();
});
