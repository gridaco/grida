import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import type { dotcanvas } from "dotcanvas";

// Adapts the desktop workspace bridge fs to `dotcanvas`'s `WritableFs`
// port. Unlike the web OPFS path, the bridge already addresses files with
// BARE, root-relative paths (`canvas.json`, `001.svg`) — the same convention
// dotcanvas uses — so there is NO leading-slash translation here.
//
// dotcanvas reads `canvas.json` and enumerates the bundle through this port; the
// per-slide SVG bytes are read/written by the editor surface directly (with
// mtime-conflict handling), not through here.

/**
 * The slice of `workspaces` this adapter needs. The real `workspacesNs`
 * satisfies it structurally; tests pass a `Map`-backed fake.
 */
export interface WorkspaceFsClient {
  readdir(
    workspaceId: string,
    relPath?: string
  ): Promise<
    ReadonlyArray<{
      rel_path: string;
      kind: "file" | "directory" | "symlink" | "other";
    }>
  >;
  readFile(workspaceId: string, relPath: string): Promise<{ content: string }>;
  writeFile(
    workspaceId: string,
    relPath: string,
    content: string,
    expectedMtime?: number
  ): Promise<{ mtime: number }>;
}

/**
 * An `dotcanvas.WritableFs` bound to one workspace. `list()` enumerates the
 * bundle's files **recursively** — descending into subdirectories itself, since
 * the bridge `readdir` lists immediate children only — so a nested `src` such as
 * `slides/001.svg` resolves for existence checks (per the `ReadableFs.list()`
 * contract). Grida's own decks are flat (root-level `nnn.svg` / `<id>.svg`), so
 * in practice no subdirectory is walked; symlinks are not followed (bundles are
 * self-contained — this also avoids cycles). `read()` returns `null` when the
 * file is absent (a missing `canvas.json` → implicit mode).
 */
export function workspaceBundleFs(
  workspaceId: string,
  client: WorkspaceFsClient = workspacesNs,
  basePath = ""
): dotcanvas.WritableFs {
  // A `.canvas` is NOT always the workspace root — it can live at `basePath`
  // inside a larger workspace (a projects folder opened in the workbench). The
  // bundle's own paths stay relative to the `.canvas` dir (`canvas.json`,
  // `001.svg`); this adapter maps them to/from the workspace-relative paths the
  // bridge speaks. `basePath` is "" when the `.canvas` itself is the workspace.
  const base = basePath.replace(/\/+$/, "");
  const abs = (p: string) => (base ? `${base}/${p}` : p);
  const stripBase = (relPath: string) =>
    base && relPath.startsWith(`${base}/`)
      ? relPath.slice(base.length + 1)
      : relPath;
  return {
    list: async () => {
      // Walk subdirectories ourselves (the bridge `readdir` is shallow) so a
      // nested `src` resolves; a flat deck (the common case) walks nothing.
      const out: string[] = [];
      const walk = async (dir: string | undefined): Promise<void> => {
        for (const e of await client.readdir(workspaceId, dir)) {
          if (e.kind === "directory") await walk(e.rel_path);
          else if (e.kind === "file") out.push(stripBase(e.rel_path));
        }
      };
      await walk(base || undefined);
      return out;
    },
    read: async (path) => {
      try {
        return (await client.readFile(workspaceId, abs(path))).content;
      } catch {
        // The manifest is optional by contract — any read failure (absent,
        // binary, oversized) degrades to "no manifest", and dotcanvas derives
        // the deck from the on-disk SVGs instead.
        return null;
      }
    },
    write: async (path, content) => {
      await client.writeFile(workspaceId, abs(path), content);
    },
  };
}
