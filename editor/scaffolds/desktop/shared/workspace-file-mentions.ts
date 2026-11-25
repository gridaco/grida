import type { WorkspacePathMatch } from "@grida/desktop-bridge";
import { ComposerMention, type ComposerCatalog } from "@/kits/composer";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "target"]);
const MAX_MENTIONS = 800;
const MAX_DEPTH = 4;
const MAX_DIRECTORIES = 64;
const MAX_PATH_BYTES = 4096;
const utf8 = new TextEncoder();

export namespace WorkspaceFileMentions {
  export function source(
    readdir: WorkspaceArtifact.Readdir,
    search?: (query: string) => Promise<WorkspacePathMatch[] | null>
  ): NonNullable<ComposerCatalog["searchMentions"]> {
    let useNative = search !== undefined;
    let compatibility: ComposerMention[] | undefined;
    return async (query, signal) => {
      signal.throwIfAborted();
      if (useNative && search) {
        const results = await search(query);
        signal.throwIfAborted();
        if (results !== null)
          return results.map(({ path, kind }) => ({
            id: path,
            label: path.slice(path.lastIndexOf("/") + 1),
            kind: kind === "directory" ? "folder" : "file",
            path,
          }));
        useNative = false;
      }
      if (!compatibility) {
        const inventory = await list(readdir, signal);
        signal.throwIfAborted();
        compatibility = inventory;
      }
      return ComposerMention.rank(compatibility, query);
    };
  }

  export async function list(
    readdir: WorkspaceArtifact.Readdir,
    signal: AbortSignal
  ): Promise<ComposerMention[]> {
    const mentions: ComposerMention[] = [];
    const directories = [{ path: "", depth: 0 }];
    scan: for (const directory of directories) {
      if (signal.aborted) return [];
      const entries = await readdir(directory.path).catch(() => []);
      if (signal.aborted) return [];
      for (const entry of entries) {
        const path = WorkspaceArtifact.normalizeRelativePath(entry.rel_path);
        if (
          path === null ||
          WorkspaceArtifact.parentPath(path) !== directory.path ||
          /\p{Cc}/u.test(path) ||
          utf8.encode(path).byteLength > MAX_PATH_BYTES
        )
          continue;
        if (entry.kind === "directory") {
          if (
            directories.length >= MAX_DIRECTORIES ||
            directory.depth >= MAX_DEPTH ||
            entry.name.startsWith(".") ||
            SKIP_DIRS.has(entry.name)
          )
            continue;
          directories.push({ path, depth: directory.depth + 1 });
        } else if (entry.kind !== "file") {
          continue;
        }
        mentions.push({
          id: path,
          label: entry.name,
          kind: entry.kind === "directory" ? "folder" : "file",
          path,
        });
        if (mentions.length === MAX_MENTIONS) break scan;
      }
    }
    return mentions.sort((left, right) =>
      (left.path ?? left.id).localeCompare(right.path ?? right.id)
    );
  }
}
