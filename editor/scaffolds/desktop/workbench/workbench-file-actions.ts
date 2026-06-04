/**
 * Shared file actions for the workspace workbench — invoked from both the
 * file tree pane's context menu (right-click on a file row) and the tab strip's
 * context menu (right-click on a tab), and from the workspace-level
 * keyboard shortcuts.
 *
 * Each action takes the workspace and a workspace-relative path. The
 * absolute path is built by joining `workspace.root` with `relPath`
 * using a forward slash — this matches the agent sidecar's path emission
 * (workspace fs surface always speaks POSIX `relPath`, regardless of
 * host platform). For macOS / Linux the resulting string is a plain
 * absolute path; for Windows, Electron's `shell.showItemInFolder`
 * accepts forward-slash paths and normalises internally.
 *
 * Errors from `bridge.shell.showItemInFolder` and `navigator.clipboard`
 * are caught and logged but never thrown — these actions are
 * "fire and forget" from the user's perspective; a clipboard failure
 * shouldn't bring down the surrounding render tree.
 */
import {
  getDesktopBridge,
  workspaces as workspacesNs,
  type Workspace,
} from "@/lib/desktop/bridge";

/**
 * Join a workspace root with a workspace-relative path. Always uses
 * `/` because the agent sidecar's fs surface emits POSIX relpaths and
 * Electron's native APIs accept mixed separators on Windows.
 */
export function absolutePathFor(workspace: Workspace, relPath: string): string {
  if (relPath.length === 0) return workspace.root;
  // Strip any accidental leading slash on relPath so the join doesn't
  // produce `/Users/x/Documents//foo`.
  const rp = relPath.startsWith("/") ? relPath.slice(1) : relPath;
  // Workspace roots are absolute and never end with a separator
  // (`registry.open` normalises via `realpath`).
  return `${workspace.root}/${rp}`;
}

/**
 * Reveal a workspace file in the host OS's file browser. Uses the
 * native bridge — falls through silently if the bridge isn't
 * mounted (e.g. SSR / non-Electron preview).
 */
export async function revealInFinder(
  workspace: Workspace,
  relPath: string
): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge) return;
  try {
    await bridge.shell.show_item_in_folder(absolutePathFor(workspace, relPath));
  } catch (err) {
    console.warn("[workspace] revealInFinder failed:", err);
  }
}

/** Copy the file's absolute path to the system clipboard. */
export async function copyAbsolutePath(
  workspace: Workspace,
  relPath: string
): Promise<void> {
  await writeClipboard(absolutePathFor(workspace, relPath));
}

/** Copy the workspace root path to the system clipboard. */
export async function copyWorkspacePath(workspace: Workspace): Promise<void> {
  await writeClipboard(workspace.root);
}

/** Copy the file's workspace-relative path to the system clipboard. */
export async function copyRelativePath(relPath: string): Promise<void> {
  await writeClipboard(relPath);
}

/**
 * Confirm (native dialog), then move a workspace entry (file or folder)
 * to the OS trash. `isDirectory` only varies the confirm copy — the main
 * process resolves and trashes either kind. Resolves `true` only when the
 * entry was actually trashed, so the caller can refresh the tree / close
 * tabs; `false` when the user cancelled, the bridge is absent, or the
 * trash failed. Like the other actions here, a failure is logged rather
 * than thrown — but unlike them this one reports its outcome, because
 * deletion needs a follow-up (tree refresh) that a no-op shouldn't trigger.
 *
 * (see test/desktop-workbench-trash-file.md)
 */
export async function confirmAndTrashEntry(
  workspace: Workspace,
  relPath: string,
  isDirectory: boolean
): Promise<boolean> {
  if (!getDesktopBridge()) return false;
  const name = relPath.split("/").filter(Boolean).pop() ?? relPath;
  const confirmed = await workspacesNs.confirmTrashEntry(name, isDirectory);
  if (!confirmed) return false;
  try {
    await workspacesNs.trashEntry(workspace.id, relPath);
    return true;
  } catch (err) {
    console.warn("[workspace] trashEntry failed:", err);
    return false;
  }
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.warn("[workspace] clipboard write failed:", err);
  }
}

/**
 * Keyboard-shortcut display strings. Hardcoded to macOS symbols
 * (`⌥⌘R` etc.) because the desktop app is mac-first today; the
 * underlying keydown matcher in `workspace-workbench.tsx` accepts both
 * Cmd and Ctrl so the shortcuts still function on Windows / Linux
 * even with macOS-style labels. A platform-aware label pass is a
 * polish item.
 */
export const REVEAL_SHORTCUT_HINT = "⌥⌘R";
export const COPY_PATH_SHORTCUT_HINT = "⌥⌘C";
export const COPY_RELATIVE_PATH_SHORTCUT_HINT = "⌥⇧⌘C";
export const TRASH_SHORTCUT_HINT = "⌘⌫";

/**
 * Pattern-match a keyboard event against one of the file-action
 * shortcuts. Returns the action name or `null`. Cross-platform: we
 * accept either `metaKey` (Cmd on mac, Win key on win) or `ctrlKey`
 * as the "command" modifier, matching the rest of the workspace
 * workbench's shortcut conventions (see Cmd+B for file tree pane toggle).
 */
export type FileActionShortcut =
  | "reveal"
  | "copy-path"
  | "copy-relative-path"
  | "trash";

export function matchFileActionShortcut(
  e: KeyboardEvent
): FileActionShortcut | null {
  const cmd = e.metaKey || e.ctrlKey;
  if (!cmd) return null;
  // Trash — Cmd/Ctrl + Delete (Finder's ⌘⌫). macOS reports "Backspace"
  // for the main Delete key and "Delete" for fn+Delete; accept both. No
  // Alt/Shift, so it never shadows the ⌥⌘ actions below. The caller is
  // responsible for ignoring this when a text field is focused (⌘⌫ is
  // "delete to start of line" there) and for confirming before acting.
  if (!e.altKey && !e.shiftKey && (e.key === "Backspace" || e.key === "Delete"))
    return "trash";
  if (!e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === "r" && !e.shiftKey) return "reveal";
  if (key === "c" && !e.shiftKey) return "copy-path";
  if (key === "c" && e.shiftKey) return "copy-relative-path";
  return null;
}
