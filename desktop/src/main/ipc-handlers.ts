import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import path from "node:path";
import { URL } from "node:url";
import {
  IPC_CHANNELS,
  type ConfirmOptions,
  type NavigationState,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from "../bridge/contract";
import { EDITOR_BASE_URL } from "../env";
import { isSafeExternalUrl } from "../window";
import { agentSidecarClient } from "./agent-sidecar-client";
import { getAgentSidecarInfo } from "./agent-sidecar-supervisor";
import { dirtyState } from "./dirty-state";
import {
  allHostAppIds,
  isHostAppId,
  openWorkspaceInHostApp,
  resolvePreferredHostApps,
  type HostAppId,
} from "./host-apps";
import { trashWorkspaceEntry } from "./workspace-files";

// `new URL(EDITOR_BASE_URL).origin` is needed per IPC invoke; parse the
// build-time constant once at module init rather than per call.
const EDITOR_ORIGIN = (() => {
  try {
    return new URL(EDITOR_BASE_URL).origin;
  } catch {
    return "";
  }
})();

/**
 * GRIDA-SEC-004 — every native-OS IPC handler MUST validate the sender
 * frame's URL is under our editor origin AND under the `/desktop/*`
 * path. The preload's path-scope check shouldn't let the bridge be
 * exposed otherwise, but a malicious renderer that bypassed sandboxing
 * could still ipcRenderer.invoke() arbitrary channels — this guard
 * makes that ineffective.
 *
 * Returns `true` to allow, `false` (and logs) to deny.
 */
function isAllowedDesktopSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  if (!frame || !EDITOR_ORIGIN) return false;
  let url: URL;
  try {
    url = new URL(frame.url);
  } catch {
    return false;
  }
  if (url.origin !== EDITOR_ORIGIN) return false;
  return url.pathname === "/desktop" || url.pathname.startsWith("/desktop/");
}

/**
 * Registers an `ipcMain.handle` that rejects any sender frame outside
 * the editor origin + `/desktop/*` path. The guard is GRIDA-SEC-004
 * load-bearing; wrapping it at registration time means a new handler
 * can't ship without it.
 */
function guarded<A extends unknown[], R>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: A) => R
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isAllowedDesktopSender(event)) {
      const url = event.senderFrame?.url ?? "<no frame>";
      console.warn(`[grida] IPC ${channel} denied: sender=${url}`);
      throw new Error(`IPC ${channel} denied`);
    }
    return handler(event, ...(args as A));
  });
}

export function registerIpcHandlers() {
  guarded(IPC_CHANNELS.AGENT_SERVER_INFO, () => {
    const info = getAgentSidecarInfo();
    if (!info) throw new Error("agent sidecar not ready");
    return info;
  });

  guarded(IPC_CHANNELS.WINDOW_SET_DOCUMENT_EDITED, (event, edited: boolean) => {
    // setDocumentEdited is macOS-only. On other platforms the
    // method exists but is a no-op — calling it is safe everywhere.
    // `dirtyState.set` dedups internally; if the flag is unchanged
    // we skip the native call too so per-keystroke IPC bursts on a
    // dirty doc don't ripple into BrowserWindow.fromWebContents.
    if (!dirtyState.set(event.sender.id, Boolean(edited))) return;
    BrowserWindow.fromWebContents(event.sender)?.setDocumentEdited(
      Boolean(edited)
    );
  });

  guarded(
    IPC_CHANNELS.WINDOW_SET_REPRESENTED_FILENAME,
    (event, filePath: string) => {
      BrowserWindow.fromWebContents(event.sender)?.setRepresentedFilename(
        String(filePath)
      );
    }
  );

  guarded(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  guarded(IPC_CHANNELS.DIALOG_CONFIRM, async (event, opts: ConfirmOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      type: "question" as const,
      message: opts.message,
      detail: opts.detail,
      buttons: opts.buttons,
      defaultId: opts.default_id,
      cancelId: opts.cancel_id,
    };
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
    return result.response;
  });

  guarded(IPC_CHANNELS.DIALOG_OPEN, async (event, opts: OpenDialogOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      defaultPath: opts.default_path,
      filters: opts.filters,
      properties: opts.properties,
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled) return null;
    return result.filePaths;
  });

  guarded(
    IPC_CHANNELS.DIALOG_SAVE_AS,
    async (event, opts: SaveDialogOptions) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options = {
        defaultPath: opts.default_path,
        filters: opts.filters,
      };
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return null;
      return result.filePath;
    }
  );

  guarded(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, async (_event, url: string) => {
    if (typeof url !== "string" || !isSafeExternalUrl(url)) {
      throw new Error(
        `[grida] refused to open url: ${String(url).slice(0, 64)}`
      );
    }
    await shell.openExternal(url);
  });

  guarded(
    IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER,
    (_event, filePath: string) => {
      if (typeof filePath !== "string" || filePath.length === 0) {
        throw new Error(
          `[grida] refused to reveal path: ${String(filePath).slice(0, 64)}`
        );
      }
      // `path.resolve` normalises `..` and treats the input as
      // already-absolute when it is; we never join against the
      // main process's cwd implicitly. If the path doesn't exist,
      // the OS silently opens the parent or no-ops.
      shell.showItemInFolder(path.resolve(filePath));
    }
  );

  guarded(IPC_CHANNELS.WINDOW_NAVIGATION_STATE, (event) =>
    computeNavigationState(event.sender)
  );

  guarded(IPC_CHANNELS.WINDOW_NAVIGATION_BACK, (event) => {
    const history = event.sender.navigationHistory;
    // Second check here is robust against a stale UI (e.g. a click in
    // flight when the history just collapsed).
    if (history.canGoBack()) history.goBack();
  });

  guarded(IPC_CHANNELS.WINDOW_NAVIGATION_FORWARD, (event) => {
    const history = event.sender.navigationHistory;
    if (history.canGoForward()) history.goForward();
  });

  guarded(
    IPC_CHANNELS.HOST_APPS_RESOLVE_PREFERRED,
    async (
      _event,
      opts: { workspace_id: string; preferred_apps?: readonly unknown[] }
    ) => {
      await findWorkspaceOrThrow(opts.workspace_id);
      const preferred =
        opts.preferred_apps === undefined
          ? allHostAppIds()
          : parsePreferredApps(opts.preferred_apps);
      // Resolve after workspace validation so stale workspace ids fail
      // instead of returning app availability for an impossible action.
      return await resolvePreferredHostApps(preferred);
    }
  );

  guarded(
    IPC_CHANNELS.HOST_APPS_OPEN_WORKSPACE,
    async (_event, opts: { workspace_id: string; app_id: string }) => {
      if (!isHostAppId(opts.app_id)) {
        throw new Error(`unknown host app: ${opts.app_id}`);
      }
      const workspace = await findWorkspaceOrThrow(opts.workspace_id);
      await openWorkspaceInHostApp(opts.app_id, workspace);
    }
  );

  // GRIDA-SEC-004: move a workspace entry (file or folder) to the OS
  // trash. The workspace is resolved from its id through the sidecar
  // (same as host-apps), and `trashWorkspaceEntry` re-validates that
  // `relPath` lands inside the workspace root (and isn't the root itself)
  // before the native `shell.trashItem`. The renderer never passes a raw
  // absolute path, so a compromised renderer can't trash entries outside
  // an opened workspace.
  guarded(
    IPC_CHANNELS.WORKSPACE_TRASH_ENTRY,
    async (_event, opts: { workspace_id: string; rel_path: string }) => {
      const workspace = await findWorkspaceOrThrow(opts.workspace_id);
      await trashWorkspaceEntry(workspace, opts.rel_path);
    }
  );
}

async function findWorkspaceOrThrow(workspaceId: string) {
  const workspaces = await agentSidecarClient.listWorkspaces();
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  return workspace;
}

function parsePreferredApps(raw: readonly unknown[]): HostAppId[] {
  const ids: HostAppId[] = [];
  for (const item of raw) {
    if (typeof item === "string" && isHostAppId(item)) ids.push(item);
  }
  return ids;
}

/**
 * Compute the current `{canGoBack, canGoForward}` for a webContents.
 * Exported so `attachNavigationEvents` (called from `window.ts` at
 * window-creation time) can publish initial state immediately rather
 * than waiting for the first `did-navigate*` to fire.
 */
export function computeNavigationState(wc: WebContents): NavigationState {
  const history = wc.navigationHistory;
  return {
    can_go_back: history.canGoBack(),
    can_go_forward: history.canGoForward(),
  };
}

/**
 * Wire a window's webContents navigation events to the renderer.
 * Called once per `BrowserWindow` at creation time (see
 * `desktop/src/window.ts::create_main_window`).
 *
 * `did-navigate` fires on full-page loads; `did-navigate-in-page`
 * fires on SPA pushState/replaceState from Next.js client routing.
 * Both invalidate the back/forward state, so both push a fresh
 * snapshot to the renderer via `WINDOW_NAVIGATION_CHANGED`. The
 * renderer's preload fans out to React subscribers from there.
 *
 * The send is guarded by `isDestroyed()` because the event handlers
 * stay attached until the webContents is torn down, and Electron can
 * deliver a final event after the renderer process has gone away
 * (Chromium's teardown ordering is not deterministic).
 */
export function attachNavigationEvents(window: BrowserWindow): void {
  const wc = window.webContents;
  let last: NavigationState | null = null;
  const publish = () => {
    if (wc.isDestroyed()) return;
    const next = computeNavigationState(wc);
    // SPA pushState/replaceState from Next.js client routing fires
    // `did-navigate-in-page` even when back/forward state didn't move
    // — skip the IPC + downstream React re-renders in that case.
    if (
      last &&
      last.can_go_back === next.can_go_back &&
      last.can_go_forward === next.can_go_forward
    ) {
      return;
    }
    last = next;
    wc.send(IPC_CHANNELS.WINDOW_NAVIGATION_CHANGED, next);
  };
  wc.on("did-navigate", publish);
  wc.on("did-navigate-in-page", publish);
}
