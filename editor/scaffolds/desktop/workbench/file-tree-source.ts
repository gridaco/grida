import { iocanvas } from "@grida/io-canvas";
import type { WorkspaceFsEntry } from "@grida/desktop-bridge";
import type { AsyncTreeEntry, AsyncTreeProvider } from "@grida/tree-view/async";

export namespace WorkspaceFileTree {
  export const ROOT_ID = "";

  /**
   * A workspace fs entry plus the one derived bit the tree needs: whether a
   * directory is actually a `.canvas` *bundle* — a macOS-style package the tree
   * presents as a single openable document (no chevron, click opens the deck)
   * instead of an expandable folder. Derived once, here, from the format
   * library's {@link iocanvas.isBundlePath}, so the row icon, activation, and
   * `hasChildren` all read the same flag rather than re-testing the suffix.
   */
  export type Meta = WorkspaceFsEntry & { readonly bundle: boolean };

  export type Readdir = (
    relPath: string
  ) => Promise<ReadonlyArray<WorkspaceFsEntry>>;

  /** A directory whose name marks it a `.canvas` bundle (an opaque package). */
  export function isBundle(entry: WorkspaceFsEntry): boolean {
    return entry.kind === "directory" && iocanvas.isBundlePath(entry.rel_path);
  }

  export function rootMeta(name: string): Meta {
    // The workspace root is always a plain container, never a bundle: a
    // `.canvas` opened on its own routes to the deck file window, not here.
    return { name, rel_path: ROOT_ID, kind: "directory", bundle: false };
  }

  export function parentRelPath(relPath: string): string {
    const normalized = relPath.replace(/^\/+|\/+$/g, "");
    if (!normalized) return ROOT_ID;
    const i = normalized.lastIndexOf("/");
    return i < 0 ? ROOT_ID : normalized.slice(0, i);
  }

  export function toEntry(entry: WorkspaceFsEntry): AsyncTreeEntry<Meta> {
    const bundle = isBundle(entry);
    return {
      id: entry.rel_path,
      // A bundle is opaque: physically a directory, but the tree never lists
      // its slides — so it gets no chevron and never expands.
      hasChildren: entry.kind === "directory" && !bundle,
      meta: { ...entry, bundle },
    };
  }

  export function createProvider({
    rootName,
    readdir,
  }: {
    rootName: string;
    readdir: Readdir;
  }): AsyncTreeProvider<Meta> {
    const knownDirectories = new Set<string>([ROOT_ID]);

    return {
      rootId: ROOT_ID,
      hasChildren(id) {
        return id === ROOT_ID || knownDirectories.has(id);
      },
      async listChildren(id, signal) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const entries = await readdir(id);
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        for (const entry of entries) {
          // A bundle stays out of `knownDirectories` so it's never treated as
          // an expandable container (same opaque-package rule as `toEntry`).
          if (entry.kind === "directory" && !isBundle(entry)) {
            knownDirectories.add(entry.rel_path);
          } else {
            knownDirectories.delete(entry.rel_path);
          }
        }

        return entries.map(toEntry);
      },
      getRootMeta() {
        return rootMeta(rootName);
      },
    };
  }
}
