/**
 * Identity of one tab in the workbench's editor group.
 *
 * A tab identifies a workspace file by its relative path, an owner-managed
 * panel by its owner's id, or a browser page by a presentation id.
 * `EditorGroup` orders opaque string keys; this namespace is the only codec
 * between those keys and typed identities. Each kind carries a prefix, so
 * reading a non-file key as a path without parsing it fails visibly.
 *
 * Browser tabs have an independent identity and URL-only restoration.
 * File-only rules (trash, reveal, copy path, save, persistence, the open files
 * the agent sees) read tabs through {@link WorkbenchTab.relPath}, which is
 * `null` for a non-file. Browser and file tabs are reopenable; a panel's owner
 * ends it when its tab closes.
 */
export type WorkbenchTab =
  | Readonly<{ kind: "file"; relPath: string }>
  | Readonly<{ kind: "panel"; id: string }>
  | Readonly<{ kind: "browser"; id: string }>;

export namespace WorkbenchTab {
  const FILE = "file:";
  const PANEL = "panel:";
  const BROWSER = "browser:";

  /** The key of the file tab for a workspace-relative path. */
  export function file(relPath: string): string {
    return FILE + relPath;
  }

  /** The key of the panel tab with `id`. */
  export function panel(id: string): string {
    return PANEL + id;
  }

  export function browser(id: string): string {
    return BROWSER + id;
  }

  export function key(tab: WorkbenchTab): string {
    switch (tab.kind) {
      case "file":
        return file(tab.relPath);
      case "panel":
        return panel(tab.id);
      case "browser":
        return browser(tab.id);
    }
  }

  /** Decode a key made by this namespace. Any other string is a defect. */
  export function parse(key: string): WorkbenchTab {
    if (key.startsWith(FILE))
      return { kind: "file", relPath: key.slice(FILE.length) };
    if (key.startsWith(PANEL))
      return { kind: "panel", id: key.slice(PANEL.length) };
    if (key.startsWith(BROWSER))
      return { kind: "browser", id: key.slice(BROWSER.length) };
    throw new Error(`Not a workbench tab key: ${key}`);
  }

  /** The workspace-relative path of a file tab; `null` for a non-file or none. */
  export function relPath(key: string | null): string | null {
    if (key === null) return null;
    const tab = parse(key);
    return tab.kind === "file" ? tab.relPath : null;
  }

  /** Owner-managed panels end on close; files and browser pages can reopen. */
  export function reopenable(key: string): boolean {
    return parse(key).kind !== "panel";
  }

  /**
   * The tabs a trashed entry closes: a file closes its own tab, a folder its
   * whole subtree. Non-file tabs are never affected.
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
