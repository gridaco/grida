/**
 * Identity of one tab in the workbench's editor group.
 *
 * A tab is either a workspace **file**, addressed by its workspace-relative
 * path, or a **panel**: a surface that is not a file (a side chat, for
 * example), addressed by an id its owner chooses. `EditorGroup` orders opaque
 * string keys; this namespace is the only codec between those keys and typed
 * identities. Both kinds carry a prefix, so no file name can collide with a
 * panel and code that reads a key as a path without parsing it fails visibly.
 *
 * File-only rules (trash, reveal, copy path, save, persistence, the open files
 * the agent sees) read tabs through {@link WorkbenchTab.relPath}, which is
 * `null` for a panel. Only file tabs are reopenable: a panel's owner ends it
 * when its tab closes.
 */
export type WorkbenchTab =
  | Readonly<{ kind: "file"; relPath: string }>
  | Readonly<{ kind: "panel"; id: string }>;

export namespace WorkbenchTab {
  const FILE = "file:";
  const PANEL = "panel:";

  /** The key of the file tab for a workspace-relative path. */
  export function file(relPath: string): string {
    return FILE + relPath;
  }

  /** The key of the panel tab with `id`. */
  export function panel(id: string): string {
    return PANEL + id;
  }

  export function key(tab: WorkbenchTab): string {
    return tab.kind === "file" ? file(tab.relPath) : panel(tab.id);
  }

  /** Decode a key made by this namespace. Any other string is a defect. */
  export function parse(key: string): WorkbenchTab {
    if (key.startsWith(FILE))
      return { kind: "file", relPath: key.slice(FILE.length) };
    if (key.startsWith(PANEL))
      return { kind: "panel", id: key.slice(PANEL.length) };
    throw new Error(`Not a workbench tab key: ${key}`);
  }

  /** The workspace-relative path of a file tab; `null` for a panel or none. */
  export function relPath(key: string | null): string | null {
    if (key === null) return null;
    const tab = parse(key);
    return tab.kind === "file" ? tab.relPath : null;
  }

  /** Reopen-closed history keeps file tabs only. */
  export function reopenable(key: string): boolean {
    return parse(key).kind === "file";
  }

  /**
   * The tabs a trashed entry closes: a file closes its own tab, a folder its
   * whole subtree. Panels are never affected.
   */
  export function trashed(
    entry: string,
    isDirectory: boolean
  ): (key: string) => boolean {
    return (key) => {
      const path = relPath(key);
      if (path === null) return false;
      return isDirectory
        ? path === entry || path.startsWith(`${entry}/`)
        : path === entry;
    };
  }
}
