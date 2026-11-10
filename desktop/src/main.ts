// GRIDA-SEC-008 — close the main-owned OAuth callback before sidecar shutdown.
import { app, shell, BrowserWindow, Menu, dialog, session } from "electron";
import path from "node:path";
import { updateElectronApp } from "update-electron-app";
import started from "electron-squirrel-startup";
import { MediaStore, RecentStore } from "@grida/daemon/server";
import create_menu, {
  focus_or_open_canvas_window,
  rebuild_application_menu,
} from "./menu";
import { open_document_window } from "./window";
import { DEEP_LINK_SCHEME, EDITOR_BASE_URL, IS_INSIDERS } from "./env";
import {
  RUNTIME_APP_NAME,
  USE_DEV_INSIDERS_BRANDING,
  create_runtime_app_icon,
} from "./branding";
import {
  startAgentSidecar,
  startRetainedMediaSidecar,
  closeRetainedMediaSidecar,
  startOwnedLegacyWriter,
  getAgentSidecarInfo,
  getAgentSidecarMode,
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
import {
  notifyNativeChat,
  startAgentNotifications,
} from "./main/agent-notifications";
import type { NativeChatLifecycle } from "./main/native-agent-chat";
import { protocol_router } from "./main/protocol-router";
import { dirtyState } from "./main/dirty-state";
import { open_handoff } from "./main/open-handoff";
import { startup_window } from "./main/startup-window-policy";
import { DesktopAccountSession } from "./main/account-session";
import { DesktopEntryWindow } from "./main/desktop-entry-window";
import { DesktopPreferences } from "./main/desktop-preferences";
import { NativeDesktopAgent } from "./main/native-desktop-agent";
import { NativeDesktopProfile } from "./main/native-desktop-profile";
import { NativeMcpLaunch } from "./main/native-mcp-launch";
import { NativeEditorMcpExport } from "./main/native-editor-mcp-export";
import { NativeExternalRuns } from "./main/native-external-runs";
import {
  nativeWorkspaceCatalog,
  nativeWorkspaceMedia,
  ordinarySelectedSvgFiles,
} from "./main/workspace-media-access";
import type { NativeWorkspaceCatalog } from "./main/native-workspace-catalog";
import { NativeDocumentFiles } from "./main/native-document-files";
import { ipc_sender } from "./main/ipc-sender";
import { DesktopMediaRoot } from "./main/media-root";
import { NativeImagePlacement } from "./main/native-image-placement";
import type { ImageReferenceReview } from "./main/native-image-generation";
import { NativeWorkspaceReview } from "./main/native-workspace-review";

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
if (app.isPackaged && !IS_INSIDERS) {
  try {
    NativeDesktopProfile.prepareFirst(
      app,
      MANAGED_NATIVE_FIRST === 1,
      MANAGED_LEGACY_PREDECESSOR === 1
    );
  } catch {
    console.error("[grida] The managed Desktop profile could not be verified.");
    // Waiting for ready would let Chromium initialize the default profile.
    app.exit(1);
  }
}
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
const workspaceReview = new NativeWorkspaceReview(
  new URL(EDITOR_BASE_URL).origin,
  (window) => entryWindow?.ipcRoleFor(window) === "main"
);
let nativeDesktopAgent: NativeDesktopAgent | undefined;
let nativeDocuments: NativeDocumentFiles | undefined;
let nativeFileWorkspaces: NativeWorkspaceCatalog | undefined;
let managedLegacyStart: ReturnType<typeof startOwnedLegacyWriter> | undefined;
let recentFiles = agentSidecarClient.recent;
let nativeQuitDrain: Promise<void> | undefined;
let nativeEditorMcp: NativeEditorMcpExport | undefined;
let nativeExternalRuns: NativeExternalRuns | undefined;
let nativeQuitReady = false;
const windowAdmission = {
  can_open: () => entryWindow?.isMain ?? false,
  native_file_available: (filePath?: string) =>
    filePath === undefined
      ? nativeDocuments !== undefined
      : open_handoff.isSupportedFile(filePath) &&
        nativeDocumentOwner(filePath) !== undefined,
  native_workspaces: () => nativeFileWorkspaces,
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

// The selected owner assigns an opaque document ID. A second OS open of the
// same file focuses its existing window rather than duplicating its edits.
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

function nativeDocumentOwner(filePath: string) {
  if (
    NativeDesktopProfile.selected() ||
    path.extname(filePath).toLowerCase() === ".svg"
  )
    return nativeDocuments;
}

async function openDocumentWindowForPath(filePath: string) {
  const owner = nativeDocumentOwner(filePath);
  if (!owner && !agentSidecarInfo) {
    console.warn("[grida] cannot open file: agent sidecar not ready");
    return;
  }
  let docId: string;
  try {
    docId = owner
      ? await owner.register(filePath)
      : await agentSidecarClient.registerPath(filePath);
  } catch (err) {
    // Surface, don't silently drop — a dropped open with no feedback is
    // exactly what made the "open while running" bug hard to diagnose.
    console.error("[grida] document registration failed:", err);
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
  // Registration above is asynchronous. Authentication or onboarding may
  // have changed while it was in flight; queue rather than letting a late
  // document window escape the entry admission gate.
  if (!entryWindow?.isMain) {
    if (!existing || existing.isDestroyed()) owner?.release(docId);
    if (!pendingFiles.includes(filePath)) pendingFiles.push(filePath);
    return;
  }
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }

  const window = open_document_window({
    app,
    base_url: EDITOR_BASE_URL,
    doc_id: docId,
    native: owner !== undefined,
    native_chat:
      nativeDesktopAgent !== undefined || NativeDesktopProfile.mediaOnly(),
  });
  if (!entryWindow.registerSecondary(window)) {
    owner?.release(docId);
    return;
  }
  documentWindows.set(docId, window);
  const unwatch =
    owner &&
    ipc_sender.watchNavigation(window.webContents, () =>
      owner.invalidate(docId)
    );
  attach_dirty_close_handler(window);
  window.on("closed", () => {
    unwatch?.();
    if (documentWindows.get(docId) === window) {
      documentWindows.delete(docId);
      owner?.release(docId);
    }
  });

  // macOS proxy-icon in title bar. Safe to call cross-platform — Electron
  // no-ops on non-darwin.
  window.setRepresentedFilename(filePath);

  // Recent — both OS (Dock right-click / jump list) and the selected
  // persistent recent-file owner.
  app.addRecentDocument(filePath);
  recentFiles.touch(filePath).catch(() => {
    console.warn("[grida] recent file could not be recorded");
  });
}

/**
 * Open a `.canvas` package directory as a slides deck. Unlike a single
 * document (registered by docId), a `.canvas` is a folder: register it as a
 * workspace — the registry respects the opened path as-is, no git-root
 * expansion — and open (or focus) its canvas window.
 */
async function openCanvasBundleForPath(dirPath: string) {
  const owner = nativeFileWorkspaces;
  if (!owner && !getAgentSidecarInfo()) {
    console.warn("[grida] cannot open .canvas: agent sidecar not ready");
    return;
  }
  let workspaceId: string;
  try {
    const workspace = owner
      ? await owner.openSelected(dirPath)
      : await agentSidecarClient.openWorkspace(dirPath);
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
    (!(isCanvas ? nativeFileWorkspaces : nativeDocumentOwner(filePath)) &&
      !agentSidecarInfo) ||
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
let strictRetainedMedia = false;
let providerApprovalStarted = false;

function approveConfiguredProviderEndpointsWhenReady(): void {
  const mode = getAgentSidecarMode();
  if (
    providerApprovalStarted ||
    mode === null ||
    mode === "disabled" ||
    !entryWindow?.isMain
  ) {
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

  // Keep a disposable profile on the build it was launched to exercise.
  const nativeProfile = NativeDesktopProfile.selected();
  const nativeChatProfile = nativeProfile && !NativeDesktopProfile.mediaOnly();
  let externalProfile: string | undefined;
  try {
    externalProfile = NativeExternalRuns.launchProfile(
      process.argv,
      nativeChatProfile
    );
  } catch {
    dialog.showErrorBox(
      "External agent could not start",
      "Use one trusted launch profile with an isolated native Linux workspace."
    );
    app.quit();
    return;
  }
  strictRetainedMedia =
    nativeProfile &&
    app.isPackaged &&
    process.platform === "darwin" &&
    process.arch === "arm64";
  if (!nativeProfile || NativeDesktopProfile.firstSelected())
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
  let workspaceCatalog: NativeWorkspaceCatalog | undefined;
  if (nativeProfile) {
    try {
      const provider = await NativeDesktopProfile.configure(app);
      const mcp = nativeChatProfile
        ? await NativeMcpLaunch.configure(
            process.argv,
            app.getPath("userData"),
            provider
          )
        : undefined;
      workspaceCatalog = nativeWorkspaceCatalog();
      const catalog = workspaceCatalog;
      const documentWorkers = nativeWorkspaceMedia();
      const media =
        documentWorkers && new MediaStore(DesktopMediaRoot.current());
      if (nativeChatProfile) {
        const options = {
          provider,
          mcp,
          onLifecycle: (
            workspaceId: string,
            event: NativeChatLifecycle,
            current: () => boolean
          ) => notifyNativeChat(workspaceId, event, windowAdmission, current),
          openExternal: (url: string) => shell.openExternal(url),
          workspaceCatalogRoot: path.dirname(catalog.directory),
          workspaceGrant: catalog.fileGrant.bind(catalog),
          imagePlacement:
            documentWorkers && media
              ? (
                  workspace: ConstructorParameters<
                    typeof NativeImagePlacement
                  >[0]
                ) =>
                  new NativeImagePlacement(workspace, {
                    catalog,
                    workers: documentWorkers,
                    media,
                    review: ({ workspace, relative, signal }) =>
                      workspaceReview.confirm(workspace.workspaceId, signal, {
                        message: "Place this generated image in the workspace?",
                        detail: path.join(workspace.root, relative),
                        accept: "Place image",
                      }),
                  })
              : undefined,
          reviewImageReference:
            (workspaceId: string): ImageReferenceReview =>
            ({ signal, model }) =>
              workspaceReview.confirm(workspaceId, signal, {
                message: "Send the attached PNG to OpenRouter?",
                detail: `OpenRouter will receive the PNG attached to this turn to generate an image with ${model}.`,
                accept: "Send PNG",
              }),
          selectableProfiles: strictRetainedMedia,
        };
        nativeDesktopAgent = NativeDesktopProfile.managedCutover()
          ? await NativeDesktopAgent.prepareExisting(
              accountSession,
              process.resourcesPath,
              {
                requireDrainedClaim: true,
                verifyWriterAdmission: async (identity, claimId) => {
                  if (!claimId) return false;
                  NativeDesktopProfile.beginPromotion({ ...identity, claimId });
                  return true;
                },
              },
              options
            )
          : await NativeDesktopAgent.prepareFresh(
              accountSession,
              process.resourcesPath,
              options
            );
      }
      await workspaceCatalog.initialize();
      if (externalProfile) {
        const profileFile = externalProfile;
        nativeExternalRuns = await workspaceCatalog.openExternalRuns((access) =>
          NativeExternalRuns.open({
            ...access,
            profileFile,
            resourcesPath: process.resourcesPath,
          })
        );
      }
      if (documentWorkers) {
        nativeFileWorkspaces = workspaceCatalog;
        nativeDocuments = new NativeDocumentFiles(
          workspaceCatalog.fileProtectionPaths(),
          app.getPath("home"),
          documentWorkers,
          path.join(app.getPath("userData"), "document-identities")
        );
      }
      recentFiles = new RecentStore(app.getPath("userData"), {
        privateFile: true,
      });
      agentSidecarClient.setWorkspaceCatalog(workspaceCatalog);
      if (nativeChatProfile && process.argv.includes("--native-chat")) {
        const catalog = workspaceCatalog;
        nativeEditorMcp = await NativeEditorMcpExport.start(
          process.argv,
          app.getPath("userData"),
          process.resourcesPath,
          {
            editorOrigin: new URL(EDITOR_BASE_URL).origin,
            admits: (sender) => {
              const window = BrowserWindow.fromWebContents(sender);
              return (
                window !== null && entryWindow?.ipcRoleFor(window) === "main"
              );
            },
            workspaceRoot: async (id) => (await catalog.fileGrant(id)).root,
          }
        );
      }
    } catch {
      dialog.showErrorBox(
        externalProfile
          ? "External agent could not start"
          : nativeChatProfile
            ? "Native chat could not start"
            : "Native files could not start",
        externalProfile
          ? "Check the private launch profile and its registered workspace."
          : !nativeChatProfile
            ? "The managed file and media profile could not be verified."
            : NativeDesktopProfile.managedCutover()
              ? "The managed legacy profile could not be verified for archival."
              : "Use a fresh Desktop profile with a separate Grida agent data directory."
      );
      app.quit();
      return;
    }
  } else {
    nativeDocuments = ordinarySelectedSvgFiles();
  }
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
      nativeEditorMcp?.revoke();
      await Promise.all([
        agentSidecarClient.clearGridaGatewaySession(),
        nativeDesktopAgent?.clearAccount(),
        nativeExternalRuns?.close().catch(() => {
          console.error(
            "[grida] external agent shutdown could not be verified"
          );
        }),
      ]);
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
  const native = nativeDesktopAgent;
  registerIpcHandlers({
    resolve_ipc_role: (window) => entryWindow?.ipcRoleFor(window) ?? null,
    recent_files: recentFiles,
    native_chat_disabled: NativeDesktopProfile.mediaOnly(),
    document_files: nativeDocuments,
    native_external_agent: nativeExternalRuns,
    resolve_document_window: (id) => documentWindows.get(id),
    publish_workspace_surfaces: (event, snapshot) =>
      nativeEditorMcp?.publish(event, snapshot) ?? Promise.resolve(false),
    ...(native && {
      resolve_native_chat: (_window, workspaceId, profileId) =>
        native.current(workspaceId, profileId),
      ensure_native_chat: (workspaceId) => native.ensure(workspaceId),
      forget_native_workspace: (workspaceId) =>
        native.forgetWorkspace(workspaceId),
      resolve_native_deck: workspaceCatalog?.rootDeck.bind(workspaceCatalog),
      native_nested_deck_chat: workspaceCatalog && {
        grant: workspaceCatalog.nestedDeck.bind(workspaceCatalog),
        current: (parent, key) => native.currentNestedDeck(parent, key),
        ensure: (grant, requireCurrent) =>
          native.ensureNestedDeck(grant, requireCurrent),
        close: (key) => native.closeNestedDeck(key),
      },
      native_document_chat: {
        current: (key) => native.currentDocument(key),
        ensure: (key, requireCurrent) =>
          native.ensureDocument(key, requireCurrent),
        close: (key) => native.closeDocument(key),
      },
      native_chat_profiles: native.selectableProfiles
        ? {
            list: (workspaceId) => native.profiles(workspaceId),
            select: (workspaceId, selection, requireCurrent) =>
              native.selectProfile(workspaceId, selection, requireCurrent),
          }
        : undefined,
      native_chatgpt_oauth: native.chatgptOAuth,
    }),
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
      if (NativeDesktopProfile.managedPredecessor()) {
        managedLegacyStart = startOwnedLegacyWriter();
        agentSidecarInfo = (await managedLegacyStart).connection;
      } else if (strictRetainedMedia) {
        agentSidecarInfo = await startRetainedMediaSidecar();
      } else {
        agentSidecarInfo = await startAgentSidecar(workspaceCatalog?.directory);
      }
      console.log(
        `[grida] agent sidecar ready on 127.0.0.1:${agentSidecarInfo.port}`
      );
      // Desktop notifications on turn-finish / pending-approval (RFC
      // `events.md` §the first consumer). Main-owned so a turn with no
      // renderer attached (queue drain, closed window) still notifies.
      if (!nativeDesktopAgent && getAgentSidecarMode() === "enabled") {
        startAgentNotifications(windowAdmission);
      }
      // Now that the sidecar is up, serve `grida-workspace://` media requests
      // by proxying to its streamed `/workspaces/file` route (#924).
      handleWorkspaceMediaProtocol(workspaceCatalog);
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

app.once("will-quit", () => {
  // A dirty window can cancel quit. Keep shared services available until
  // Electron confirms that all windows have closed.
  closeChatGptOAuth();
  if (!managedLegacyStart && !strictRetainedMedia) stopAgentSidecar();
  disposeAllTerminals();
  void disposeAllWorkspaceWatches();
});

app.on("will-quit", (event) => {
  if (accountRevalidationTimer) {
    clearTimeout(accountRevalidationTimer);
    accountRevalidationTimer = null;
  }
  entryWindow?.beginShutdown();
  if (
    (!nativeDesktopAgent &&
      !nativeEditorMcp &&
      !nativeExternalRuns &&
      !managedLegacyStart &&
      !strictRetainedMedia) ||
    nativeQuitReady
  )
    return;
  event.preventDefault();
  nativeQuitDrain ??= Promise.allSettled([
    nativeDesktopAgent?.close(),
    nativeEditorMcp?.close(),
    nativeExternalRuns?.close(),
    managedLegacyStart?.then((writer) => writer.drain()),
    strictRetainedMedia ? closeRetainedMediaSidecar() : undefined,
  ])
    .then((outcomes) => {
      if (outcomes.some((outcome) => outcome.status === "rejected"))
        console.error("[grida] local agent shutdown could not be verified");
    })
    .finally(() => {
      nativeQuitReady = true;
      // Electron still handles the canceled quit while a fast drain settles
      // in microtasks. Retry after the native event has returned.
      setImmediate(() => app.quit());
    });
});
