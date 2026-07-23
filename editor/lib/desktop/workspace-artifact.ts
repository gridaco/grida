import { dotcanvas } from "dotcanvas";
import type { WorkspaceFsEntry } from "@grida/desktop-bridge";

/**
 * The path and entry rules shared by Desktop workspace surfaces.
 *
 * Agent tools address workspace entries with rooted virtual paths (`/a.svg`);
 * the Desktop bridge and editor tabs use relative paths (`a.svg`). This module
 * is the strict seam between those two vocabularies and owns the eligibility
 * rule used by workspace-surface requests.
 */
export namespace WorkspaceArtifact {
  const MAX_PATH_LENGTH = 4096;

  export type Readdir = (
    relPath: string
  ) => Promise<ReadonlyArray<WorkspaceFsEntry>>;

  /** Convert a canonical agent-fs path into the bridge/editor path space. */
  export function fromAgentPath(path: string): string | null {
    if (!path.startsWith("/") || path.startsWith("//")) return null;
    return normalizeRelativePath(path.slice(1));
  }

  /** Validate a bridge/editor path without silently changing its identity. */
  export function normalizeRelativePath(path: string): string | null {
    if (
      path.length === 0 ||
      path.length > MAX_PATH_LENGTH ||
      path.startsWith("/") ||
      path.endsWith("/") ||
      path.includes("\\") ||
      path.includes("\0")
    ) {
      return null;
    }

    const segments = path.split("/");
    if (
      segments.some(
        (segment) => segment.length === 0 || segment === "." || segment === ".."
      )
    ) {
      return null;
    }
    return segments.join("/");
  }

  /** Convert a bridge/editor path to the canonical model-facing vocabulary. */
  export function toAgentPath(relPath: string): string | null {
    const normalized = normalizeRelativePath(relPath);
    return normalized === null ? null : `/${normalized}`;
  }

  /** Parent directory in the bridge's relative path space (`""` is root). */
  export function parentPath(relPath: string): string {
    const separator = relPath.lastIndexOf("/");
    return separator < 0 ? "" : relPath.slice(0, separator);
  }

  /**
   * Resolve one exact entry without traversing unrelated directories.
   *
   * `readdir` is the host authority: a caller-supplied suffix is never enough
   * to claim that an artifact exists.
   */
  export async function find(
    readdir: Readdir,
    relPath: string
  ): Promise<WorkspaceFsEntry | null> {
    const normalized = normalizeRelativePath(relPath);
    if (normalized === null) return null;
    const entries = await readdir(parentPath(normalized));
    return entries.find((entry) => entry.rel_path === normalized) ?? null;
  }

  /** Files are artifacts; directories are artifacts only when `.canvas`. */
  export function isOpenable(entry: WorkspaceFsEntry): boolean {
    return (
      entry.kind === "file" ||
      (entry.kind === "directory" && dotcanvas.isBundlePath(entry.rel_path))
    );
  }
}
