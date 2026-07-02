/**
 * GRIDA-SEC-004 — move-to-trash for a workspace entry (file or folder).
 *
 * Trash is an OS capability (`shell.trashItem`), so — unlike the workspace
 * fs reads/writes, which the agent sidecar serves and contains — this
 * destructive action runs in the Electron main process. The renderer can
 * only ask to trash `{workspaceId, relPath}` (never a raw absolute path);
 * main re-derives and re-validates the path here before the native call.
 * A same-origin XSS that reached the bridge is therefore confined to
 * trashing entries inside an already-opened workspace, and never one that
 * the workspace's own symlinks happen to point at outside it.
 *
 * The containment policy mirrors `@grida/daemon`'s `workspaces/fs.ts`
 * `resolveInside` (the canonical owner): reject a non-relative path, a
 * string-level `..` escape, and a symlink whose realpath leaves the
 * workspace. It additionally refuses the workspace root itself — trashing
 * a file or a subfolder is fine (and recoverable), but trashing the whole
 * opened workspace is not an affordance we expose. Kept as a
 * side-effect-free function so it can be unit-tested
 * (`workspace-files.test.ts`) without an Electron runtime. If you change
 * the policy here, change it there too.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { shell } from "electron";
import type { Workspace } from "../bridge/contract";

export type WorkspaceFileErrorCode =
  | "path-not-relative"
  | "path-escapes-workspace"
  | "is-workspace-root";

export class WorkspaceFileError extends Error {
  constructor(
    readonly code: WorkspaceFileErrorCode,
    readonly relPath: string
  ) {
    super(`${code}: ${relPath}`);
    this.name = "WorkspaceFileError";
  }
}

function workspacePrefix(root: string): string {
  return root.endsWith(path.sep) ? root : root + path.sep;
}

function isInside(root: string, abs: string): boolean {
  return abs === root || abs.startsWith(workspacePrefix(root));
}

/**
 * Resolve `relPath` to the canonical absolute path of an entry (file or
 * folder) strictly inside `root`, or throw a {@link WorkspaceFileError}.
 * Side effects are limited to the `realpath` reads, which is what keeps
 * it unit-testable.
 *
 * `root` is expected to already be canonical (the agent host realpaths
 * workspace roots when it opens them); we realpath it again so the check
 * is canonical-to-canonical even if a caller passes a raw root.
 */
export async function resolveContainedEntry(
  root: string,
  relPath: string
): Promise<string> {
  if (
    typeof relPath !== "string" ||
    relPath.length === 0 ||
    relPath.includes("\0") ||
    path.isAbsolute(relPath)
  ) {
    throw new WorkspaceFileError("path-not-relative", String(relPath));
  }
  // String-level containment first, before any fs syscall, so `../`
  // escapes fail fast.
  const candidate = path.resolve(root, relPath);
  if (!isInside(root, candidate)) {
    throw new WorkspaceFileError("path-escapes-workspace", relPath);
  }
  // realpath resolves symlinks (and throws ENOENT for a missing entry —
  // trash needs an existing one, so that propagates to the caller) and
  // lets us reject an in-workspace symlink that points outside.
  const realRoot = await fs.realpath(root);
  const real = await fs.realpath(candidate);
  if (!isInside(realRoot, real)) {
    throw new WorkspaceFileError("path-escapes-workspace", relPath);
  }
  // Refuse the workspace root itself (e.g. `.` or `sub/..`). Trashing a
  // file or subfolder is fine; trashing the whole opened workspace is not
  // an affordance we expose.
  if (real === realRoot) {
    throw new WorkspaceFileError("is-workspace-root", relPath);
  }
  return real;
}

/**
 * Move a workspace-relative entry (file or folder) to the OS trash.
 * Throws {@link WorkspaceFileError} on a containment violation, a Node fs
 * error (e.g. ENOENT) if the entry is already gone, or whatever
 * `shell.trashItem` rejects with when the platform trash fails. For a
 * folder, `shell.trashItem` moves the whole subtree (recoverably).
 */
export async function trashWorkspaceEntry(
  workspace: Workspace,
  relPath: string
): Promise<void> {
  const abs = await resolveContainedEntry(workspace.root, relPath);
  await shell.trashItem(abs);
}
