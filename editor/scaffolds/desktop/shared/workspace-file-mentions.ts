import type { ComposerMention } from "@/kits/composer";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "target"]);
const MAX_FILES = 800;
const MAX_DEPTH = 4;
const MAX_DIRECTORIES = 64;
const MAX_PATH_BYTES = 4096;
const utf8 = new TextEncoder();

export namespace WorkspaceFileMentions {
  export type Mode = "native" | "compatibility";

  export async function list(
    readdir: WorkspaceArtifact.Readdir,
    signal: AbortSignal,
    mode: Mode
  ): Promise<ComposerMention[]> {
    const files: ComposerMention[] = [];
    const directories = [{ path: "", depth: 0 }];
    const compatibility = mode === "compatibility";
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
            directories.length < MAX_DIRECTORIES &&
            directory.depth < MAX_DEPTH &&
            !entry.name.startsWith(".") &&
            !SKIP_DIRS.has(entry.name)
          )
            directories.push({ path, depth: directory.depth + 1 });
        } else if (
          entry.kind === "file" ||
          (compatibility && entry.kind === "symlink")
        ) {
          files.push({
            id: path,
            label: compatibility ? entry.name : path,
            kind: "file",
            path,
            description: path,
          });
          if (files.length === MAX_FILES) break scan;
        }
      }
    }
    return files.sort((left, right) => left.label.localeCompare(right.label));
  }
}
