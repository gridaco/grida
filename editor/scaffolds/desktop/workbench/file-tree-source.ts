import type { WorkspaceFsEntry } from "@grida/desktop-bridge";
import type { AsyncTreeEntry, AsyncTreeProvider } from "@grida/tree-view/async";

export namespace WorkspaceFileTree {
  export const ROOT_ID = "";

  export type Meta = WorkspaceFsEntry;

  export type Readdir = (
    relPath: string
  ) => Promise<ReadonlyArray<WorkspaceFsEntry>>;

  export function rootMeta(name: string): WorkspaceFsEntry {
    return { name, rel_path: ROOT_ID, kind: "directory" };
  }

  export function parentRelPath(relPath: string): string {
    const normalized = relPath.replace(/^\/+|\/+$/g, "");
    if (!normalized) return ROOT_ID;
    const i = normalized.lastIndexOf("/");
    return i < 0 ? ROOT_ID : normalized.slice(0, i);
  }

  export function toEntry(
    entry: WorkspaceFsEntry
  ): AsyncTreeEntry<WorkspaceFsEntry> {
    return {
      id: entry.rel_path,
      hasChildren: entry.kind === "directory",
      meta: entry,
    };
  }

  export function createProvider({
    rootName,
    readdir,
  }: {
    rootName: string;
    readdir: Readdir;
  }): AsyncTreeProvider<WorkspaceFsEntry> {
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
          if (entry.kind === "directory") knownDirectories.add(entry.rel_path);
          else knownDirectories.delete(entry.rel_path);
        }

        return entries.map(toEntry);
      },
      getRootMeta() {
        return rootMeta(rootName);
      },
    };
  }
}
