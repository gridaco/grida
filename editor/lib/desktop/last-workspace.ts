/**
 * Last workspace-backed surface the user was looking at.
 *
 * This is renderer UX state, not workspace-registry truth. The daemon owns
 * which workspaces exist; this module remembers only which registered id a
 * cold launch should try to resume. The welcome bootstrap validates the id
 * against the daemon before navigating, so stale localStorage never grants
 * authority or creates a workspace. Workbench-internal continuity belongs to
 * `WorkspaceViewState`; this record should not grow into a layout snapshot.
 */

import type { WorkspaceFsEntry } from "@grida/desktop-bridge";
import { WorkspaceArtifact } from "./workspace-artifact";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type WorkspaceRecord = {
  id: string;
  root: string;
};

type WorkspaceResolver = {
  list(): Promise<WorkspaceRecord[]>;
  openFolder(rootPath: string): Promise<WorkspaceRecord>;
  readdir(workspaceId: string, relPath?: string): Promise<WorkspaceFsEntry[]>;
};

const STORAGE_KEY = "grida.lastWorkspace";
const VERSION = 1;

export namespace last_workspace {
  export type Target =
    | {
        surface: "workbench";
        workspace_id: string;
        /**
         * Legacy v1 handoff. New workbenches persist their complete tab group
         * in `WorkspaceViewState`; this remains readable for one-way migration.
         */
        active_path?: string;
      }
    | {
        surface: "canvas";
        workspace_id: string;
        base_path: string;
      };

  export function remember(storage: StorageLike, target: Target): void {
    try {
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: VERSION, ...target })
      );
    } catch {
      // Optional UX state: storage denial/quota must never block the editor.
    }
  }

  export function read(storage: StorageLike): Target | null {
    let raw: string | null;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;

    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (value.version !== VERSION || !isWorkspaceId(value.workspace_id)) {
        forget(storage);
        return null;
      }
      if (value.surface === "workbench") {
        const target: Target = {
          surface: "workbench",
          workspace_id: value.workspace_id,
        };
        if (value.active_path === undefined) return target;
        const activePath =
          typeof value.active_path === "string"
            ? WorkspaceArtifact.normalizeRelativePath(value.active_path)
            : null;
        if (activePath === null) {
          // Optional surface state must never invalidate an otherwise valid
          // workspace. Clean only the unusable artifact path.
          remember(storage, target);
          return target;
        }
        return { ...target, active_path: activePath };
      }
      if (value.surface === "canvas" && isSafeBasePath(value.base_path)) {
        return {
          surface: "canvas",
          workspace_id: value.workspace_id,
          base_path: value.base_path,
        };
      }
    } catch {
      // Corrupt optional state falls through to the normal welcome surface.
    }

    forget(storage);
    return null;
  }

  export function forget(storage: StorageLike): void {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Optional UX state: best-effort cleanup only.
    }
  }

  export function href(target: Target): string {
    const id = encodeURIComponent(target.workspace_id);
    if (target.surface === "workbench") {
      const activePath = target.active_path
        ? `&path=${encodeURIComponent(target.active_path)}`
        : "";
      return `/desktop/workspace?id=${id}${activePath}`;
    }
    const basePath = target.base_path
      ? `&path=${encodeURIComponent(target.base_path)}`
      : "";
    return `/desktop/file?id=${id}${basePath}`;
  }

  /**
   * Resolve saved UX state against daemon truth and re-open the registered
   * root. `openFolder` is intentionally the existing operation: it validates
   * that the directory is still available and refreshes registry recency.
   * A missing registry id is stale and is forgotten; an unavailable path
   * throws so the caller can fall back without erasing a temporarily-unmounted
   * workspace.
   */
  export async function resolve(
    storage: StorageLike,
    workspaces: WorkspaceResolver
  ): Promise<Target | null> {
    const target = read(storage);
    if (!target) return null;

    const registered = (await workspaces.list()).find(
      (workspace) => workspace.id === target.workspace_id
    );
    if (!registered) {
      forget(storage);
      return null;
    }

    const reopened = await workspaces.openFolder(registered.root);
    let relocated: Target = { ...target, workspace_id: reopened.id };
    let changed = reopened.id !== target.workspace_id;
    if (relocated.surface === "workbench" && relocated.active_path) {
      try {
        const entry = await WorkspaceArtifact.find(
          (relPath) => workspaces.readdir(relocated.workspace_id, relPath),
          relocated.active_path
        );
        if (!entry || !WorkspaceArtifact.isOpenable(entry)) {
          relocated = {
            surface: "workbench",
            workspace_id: relocated.workspace_id,
          };
          changed = true;
        }
      } catch (error) {
        if (!isMissingEntry(error)) throw error;
        relocated = {
          surface: "workbench",
          workspace_id: relocated.workspace_id,
        };
        changed = true;
      }
    }
    if (relocated.surface === "canvas") {
      try {
        // An empty implicit bundle is valid; successful enumeration is the
        // existence check. Requiring `.canvas.json` would reject the editor's
        // supported manifest-less canvas directories.
        await workspaces.readdir(relocated.workspace_id, relocated.base_path);
      } catch (error) {
        if (!isMissingEntry(error)) throw error;
        forget(storage);
        return null;
      }
    }

    if (changed) remember(storage, relocated);
    return relocated;
  }
}

function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isSafeBasePath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    value.includes("\0") ||
    value.startsWith("/") ||
    value.includes("\\")
  ) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => segment !== "." && segment !== "..");
}

function isMissingEntry(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (value.status === 404 || value.code === "enoent") return true;
  return (
    typeof value.message === "string" &&
    /(?:\b404\b|\benoent\b)/i.test(value.message)
  );
}
