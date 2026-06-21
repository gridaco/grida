import {
  App,
  Shell,
  BrowserWindow,
  MenuItemConstructorOptions,
  Menu,
  dialog,
  type BaseWindow,
} from "electron";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  open_welcome_window,
  open_settings_window,
  open_workspace_window,
  open_canvas_window,
} from "./window";
import { EDITOR_BASE_URL } from "./env";
import { getAgentSidecarInfo } from "./main/agent-sidecar-supervisor";
import { agentSidecarClient } from "./main/agent-sidecar-client";
import { focusWindowByUrl } from "./main/window-focus";
import { IPC_CHANNELS } from "./bridge/contract";

/**
 * "Preferences…" menu click handler. Macros and a separate window
 * mirror native conventions (macOS Cmd+, opens app prefs in a window
 * distinct from any open doc). Dedup: if a `/desktop/settings` window
 * already exists, focus it instead of spawning a second one.
 */
function open_or_focus_settings(app: App) {
  if (focusWindowByUrl("/desktop/settings")) return;
  const agentSidecar = getAgentSidecarInfo();
  if (!agentSidecar) return; // pre-ready / between restarts
  open_settings_window({ app, base_url: EDITOR_BASE_URL });
}

/**
 * "Open…" menu handler. Drives the native open panel from main. The
 * picker accepts **both** a folder (opened as a workspace, or as a
 * `.canvas` deck when it contains `canvas.json`) and a single supported
 * file (`.svg` / `.grida`, opened in its own document window). The
 * file branch is delegated to `onOpenFile` — the same handler the OS
 * file-open path uses — so document dedup + the dirty-close prompt are
 * shared, not re-implemented here.
 *
 * Each workspace gets at most one Electron BrowserWindow — opening
 * an already-open workspace refocuses the existing window rather
 * than spawning a duplicate. Dedup is by the URL's `?id=` query
 * since the renderer side encodes it there.
 */
/** What the open panel selects. macOS can offer both in one dialog; Windows
 *  and Linux can't — Electron degrades a combined `openFile` + `openDirectory`
 *  panel to a directory selector — so there the File menu splits this into
 *  separate "Open File…" / "Open Folder…" items, each requesting one `kind`. */
type OpenKind = "any" | "file" | "directory";

async function open_picker_and_register(
  app: App,
  kind: OpenKind,
  onOpenFile?: (filePath: string) => void
): Promise<void> {
  const agentSidecar = getAgentSidecarInfo();
  if (!agentSidecar) return; // pre-ready / between restarts
  const focused = BrowserWindow.getFocusedWindow() ?? undefined;
  // The file filter gates selectable files to the types Grida can open (folders
  // stay selectable regardless) so the user can't pick an unopenable file and
  // have it silently dropped. `.canvas` lists here so a packaged build (where
  // it's a macOS package, i.e. a "file") can pick it as a file; unpackaged — and
  // always on Windows/Linux — it's a plain folder, selected in directory mode.
  // `createDirectory` surfaces the macOS "New Folder" button. Electron can't
  // combine file + directory selection on Windows/Linux, so each menu item
  // requests one concrete `kind` there ("any" is only ever used on macOS).
  const properties: NonNullable<Electron.OpenDialogOptions["properties"]> =
    kind === "file"
      ? ["openFile"]
      : kind === "directory"
        ? ["openDirectory", "createDirectory"]
        : ["openFile", "openDirectory", "createDirectory"];
  const options: Electron.OpenDialogOptions = {
    properties,
    filters: [{ name: "Grida", extensions: ["grida", "svg", "canvas"] }],
  };
  const result = focused
    ? await dialog.showOpenDialog(focused, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return;
  const picked = result.filePaths[0];

  // A single supported file → the document-window path (handled by the OS
  // file-open handler, so dedup + dirty-close are shared). A `.canvas`
  // package is a directory on disk even when the panel treats it as a file,
  // so `statSync` keeps it on the workspace/deck branch below.
  let isDirectory: boolean;
  try {
    isDirectory = statSync(picked).isDirectory();
  } catch (err) {
    console.error("[grida] open: stat failed:", err);
    dialog.showErrorBox(
      "Couldn't open",
      err instanceof Error ? err.message : String(err)
    );
    return;
  }
  if (!isDirectory) {
    onOpenFile?.(picked);
    return;
  }

  let workspaceId: string;
  // Auto-detect: a folder that contains `canvas.json` opens the `.canvas`
  // slides editor; anything else opens the file workbench. Sniff the RESOLVED
  // root (the agent server may expand the picked path to a containing repo).
  let isCanvas = false;
  try {
    const workspace = await agentSidecarClient.openWorkspace(picked);
    workspaceId = workspace.id;
    isCanvas = existsSync(join(workspace.root, "canvas.json"));
  } catch (err) {
    console.error("[grida] open workspace failed:", err);
    dialog.showErrorBox(
      "Couldn't open folder",
      err instanceof Error ? err.message : String(err)
    );
    return;
  }
  if (isCanvas) {
    focus_or_open_canvas_window({
      app,
      agentSidecar,
      workspace_id: workspaceId,
    });
  } else {
    focus_or_open_workspace_window({
      app,
      agentSidecar,
      workspace_id: workspaceId,
    });
  }
  // Record the folder in Recents, matching the OS-open paths (`main.ts` adds
  // both files and directories). The file branch above already does this via
  // `onOpenFile`, so only the directory branch needs it here.
  app.addRecentDocument(picked);
}

/**
 * Focus a workspace window for `workspaceId` if one exists, else
 * spawn a new one. Used by both the menu and the IPC bridge so
 * "open folder" UX is uniform regardless of entry point.
 *
 * Match is by `?id=<workspaceId>` in the window URL — the workspace
 * page encodes it that way and never rewrites it client-side.
 */
function focus_or_open_workspace_window({
  app,
  agentSidecar,
  workspace_id: workspaceId,
}: {
  app: App;
  agentSidecar: ReturnType<typeof getAgentSidecarInfo>;
  workspace_id: string;
}) {
  if (!agentSidecar) return;
  const needle = `/desktop/workspace?id=${encodeURIComponent(workspaceId)}`;
  if (focusWindowByUrl(needle)) return;
  open_workspace_window({
    app,
    base_url: EDITOR_BASE_URL,
    workspace_id: workspaceId,
  });
}

/**
 * Focus a `.canvas` slides window for `workspaceId` if one exists, else spawn
 * one. Mirrors {@link focus_or_open_workspace_window}; match is by the
 * `/desktop/file?id=` URL the shared file window encodes for bundle mode.
 */
function focus_or_open_canvas_window({
  app,
  agentSidecar,
  workspace_id: workspaceId,
}: {
  app: App;
  agentSidecar: ReturnType<typeof getAgentSidecarInfo>;
  workspace_id: string;
}) {
  if (!agentSidecar) return;
  const needle = `/desktop/file?id=${encodeURIComponent(workspaceId)}`;
  if (focusWindowByUrl(needle)) return;
  open_canvas_window({
    app,
    base_url: EDITOR_BASE_URL,
    workspace_id: workspaceId,
  });
}

export { focus_or_open_workspace_window, focus_or_open_canvas_window };

function is_workspace_window(window: BrowserWindow): boolean {
  try {
    const url = new URL(window.webContents.getURL());
    return url.pathname === "/desktop/workspace";
  } catch {
    return false;
  }
}

function close_tab_or_window(baseWindow?: BaseWindow): void {
  const focusedWindow =
    baseWindow instanceof BrowserWindow
      ? baseWindow
      : BrowserWindow.getFocusedWindow();
  if (!focusedWindow) return;
  if (is_workspace_window(focusedWindow)) {
    focusedWindow.webContents.send(
      IPC_CHANNELS.WORKSPACE_COMMAND,
      "workspace.tabs.close-active"
    );
    return;
  }
  focusedWindow.close();
}

/**
 * Recursively merge `extras` into `base`. Items are matched by `label`;
 * properties on `extras` override `base`. If both sides of a match carry
 * a `submenu` array, the submenus are merged recursively. Items in
 * `extras` with no label match are appended.
 */
export function merge_templates(
  base: MenuItemConstructorOptions[],
  extras: MenuItemConstructorOptions[]
): MenuItemConstructorOptions[] {
  const merged = [...base];
  for (const item of extras) {
    const idx = merged.findIndex((m) => m.label === item.label);
    if (idx === -1) {
      merged.push(item);
      continue;
    }
    const base_item = merged[idx];
    const next: MenuItemConstructorOptions = { ...base_item, ...item };
    if (Array.isArray(base_item.submenu) && Array.isArray(item.submenu)) {
      next.submenu = merge_templates(
        base_item.submenu as MenuItemConstructorOptions[],
        item.submenu as MenuItemConstructorOptions[]
      );
    }
    merged[idx] = next;
  }
  return merged;
}

export function create_default_menu(
  app: App,
  shell: Shell
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", accelerator: "CmdOrCtrl+Z" },
        { role: "redo", accelerator: "Shift+CmdOrCtrl+Z" },
        { type: "separator" },
        { role: "cut", accelerator: "CmdOrCtrl+X" },
        { role: "copy", accelerator: "CmdOrCtrl+C" },
        { role: "paste", accelerator: "CmdOrCtrl+V" },
        { role: "selectAll", accelerator: "CmdOrCtrl+A" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+Shift+Alt+R",
          click: (menuItem, baseWindow) => {
            const focusedWindow =
              baseWindow instanceof BrowserWindow ? baseWindow : undefined;
            if (focusedWindow) focusedWindow.reload();
          },
        },
        {
          label: "Toggle Full Screen",
          accelerator: process.platform === "darwin" ? "Ctrl+Command+F" : "F11",
          click: (menuItem, baseWindow) => {
            const focusedWindow =
              baseWindow instanceof BrowserWindow ? baseWindow : undefined;
            if (focusedWindow)
              focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
          },
        },
      ],
    },
    {
      label: "Window",
      role: "window",
      submenu: [
        { role: "minimize", accelerator: "CmdOrCtrl+M" },
        {
          label: "Close",
          accelerator: "CmdOrCtrl+W",
          click: (_menuItem, baseWindow) => close_tab_or_window(baseWindow),
        },
        { type: "separator" },
        { accelerator: "CmdOrCtrl+Alt+I", role: "toggleDevTools" },
      ],
    },
    {
      label: "Help",
      role: "help",
      submenu: [
        {
          label: "Slack Community",
          click: () => shell.openExternal("https://grida.co/join-slack"),
        },
        {
          label: "Open an Issue",
          click: () =>
            shell.openExternal("http://github.com/gridaco/grida/issues"),
        },
        {
          label: "Discussions",
          click: () =>
            shell.openExternal("https://github.com/orgs/gridaco/discussions"),
        },
      ],
    },
  ];

  // macOS specific adjustments
  if (process.platform === "darwin") {
    const appName: string = app.name || "Application";
    template.unshift({
      label: appName,
      submenu: [
        { role: "about", label: "About " + appName },
        { type: "separator" },
        {
          label: "Settings…",
          accelerator: "Command+,",
          click: () => open_or_focus_settings(app),
        },
        { type: "separator" },
        { role: "services", label: "Services", submenu: [] },
        { type: "separator" },
        {
          role: "hide",
          label: "Hide " + appName,
          accelerator: "Command+H",
        },
        {
          role: "unhide",
          label: "Show All",
        },
        { type: "separator" },
        {
          role: "quit",
          label: "Quit " + appName,
          accelerator: "Command+Q",
          click: () => app.quit(),
        },
      ],
    });

    // Add "Bring All to Front" to the Window menu
    const windowMenu = template.find((m) => m.role === "window") as
      | MenuItemConstructorOptions
      | undefined;
    if (windowMenu && Array.isArray(windowMenu.submenu)) {
      (windowMenu.submenu as MenuItemConstructorOptions[]).push(
        { type: "separator" },
        { role: "front", label: "Bring All to Front" }
      );
    }
  }

  return template;
}

export default function create_menu(
  app: App,
  shell: Shell,
  opts?: { onOpenFile?: (filePath: string) => void }
) {
  const default_menu = create_default_menu(app, shell);
  // Minimal File menu. An extension-keyed registry (one entry per
  // openable file type) is the next iteration when modules other than
  // `.svg` / `.grida` land.
  const desktop_menus: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => {
            const agentSidecar = getAgentSidecarInfo();
            // Pre-ready or between supervisor restarts → no-op rather
            // than open a window that can't reach the agent sidecar.
            if (!agentSidecar) return;
            open_welcome_window({
              app,
              base_url: EDITOR_BASE_URL,
            });
          },
        },
        // macOS offers files + folders in one panel; Windows/Linux can't, so
        // they get two items (a combined panel would silently become folder-only
        // there, making `.svg`/`.grida` files unopenable from the menu).
        ...(process.platform === "darwin"
          ? [
              {
                label: "Open…",
                accelerator: "CmdOrCtrl+O",
                click: () => {
                  void open_picker_and_register(app, "any", opts?.onOpenFile);
                },
              },
            ]
          : [
              {
                label: "Open File…",
                accelerator: "CmdOrCtrl+O",
                click: () => {
                  void open_picker_and_register(app, "file", opts?.onOpenFile);
                },
              },
              {
                label: "Open Folder…",
                accelerator: "CmdOrCtrl+Shift+O",
                click: () => {
                  void open_picker_and_register(
                    app,
                    "directory",
                    opts?.onOpenFile
                  );
                },
              },
            ]),
        // Cross-platform shortcut to Settings. macOS gets the same
        // entry under the app menu (above) per platform convention,
        // but Cmd/Ctrl+, is the universal expectation — keep it here
        // too so Win/Linux users discover it without leaving File.
        ...(process.platform === "darwin"
          ? []
          : [
              { type: "separator" as const },
              {
                label: "Settings…",
                accelerator: "Ctrl+,",
                click: () => open_or_focus_settings(app),
              },
            ]),
      ],
    },
  ];

  return Menu.buildFromTemplate(merge_templates(default_menu, desktop_menus));
}
