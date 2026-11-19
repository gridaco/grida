/**
 * Last content surface the user focused in Desktop.
 *
 * The welcome bootstrap validates workspace targets against the daemon before
 * navigating. Workbench-internal continuity belongs to `WorkspaceViewState`.
 */

import type { WorkspaceFsEntry } from "@grida/desktop-bridge";
import { WorkspaceArtifact } from "./workspace-artifact";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type WorkspaceRecord = {
  id: string;
  root: string;
};

type WorkspaceResolver = {
  list(): Promise<WorkspaceRecord[]>;
  openFolder(rootPath: string): Promise<WorkspaceRecord>;
  readdir(workspaceId: string, relPath?: string): Promise<WorkspaceFsEntry[]>;
};

// Keep the existing slot so version 1 workspace targets survive the upgrade.
const STORAGE_KEY = "grida.lastWorkspace";
const VERSION = 2;

export namespace WindowContentState {
  type WorkspaceTarget =
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

  export type Target = { surface: "home" } | WorkspaceTarget;

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
      if (value.version !== 1 && value.version !== VERSION) return null;
      if (value.version === VERSION && value.surface === "home") {
        return { surface: "home" };
      }
      if (!isWorkspaceId(value.workspace_id)) return null;
      if (value.surface === "workbench") {
        const target: WorkspaceTarget = {
          surface: "workbench",
          workspace_id: value.workspace_id,
        };
        if (value.active_path === undefined) return target;
        const activePath =
          typeof value.active_path === "string"
            ? WorkspaceArtifact.normalizeRelativePath(value.active_path)
            : null;
        return activePath === null
          ? target
          : { ...target, active_path: activePath };
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

    return null;
  }

  export function href(target: WorkspaceTarget): string {
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
   * Leave persistence to the focused view so an in-flight restore cannot
   * overwrite a newer window's saved state.
   */
  export async function resolve(
    storage: StorageLike,
    workspaces: WorkspaceResolver
  ): Promise<Target | null> {
    const target = read(storage);
    if (!target || target.surface === "home") return target;

    const registered = (await workspaces.list()).find(
      (workspace) => workspace.id === target.workspace_id
    );
    if (!registered) return null;

    const reopened = await workspaces.openFolder(registered.root);
    const relocated = { ...target, workspace_id: reopened.id };
    if (relocated.surface === "workbench" && relocated.active_path) {
      let entry: WorkspaceFsEntry | null = null;
      try {
        entry = await WorkspaceArtifact.find(
          (relPath) => workspaces.readdir(relocated.workspace_id, relPath),
          relocated.active_path
        );
      } catch (error) {
        if (!isMissingEntry(error)) throw error;
      }
      if (!entry || !WorkspaceArtifact.isOpenable(entry)) {
        return {
          surface: "workbench",
          workspace_id: relocated.workspace_id,
        };
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
        return null;
      }
    }

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
