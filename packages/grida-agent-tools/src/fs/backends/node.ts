import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AgentFs } from "../index";

/**
 * Node `fs.promises`-backed implementation. The fs's logical paths
 * (`/canvas.svg`, `/notes/draft.md`) are rooted under `baseDir` on disk;
 * subdirectories are created on demand.
 *
 * Use cases:
 *  - Unit tests against a real filesystem (point at `os.tmpdir()`).
 *  - Future server-side persistence (mount on a per-org / per-project
 *    base directory; out of scope for the demo).
 *
 * Not safe for concurrent writers on the same path — there's no locking.
 * The fs layer's auto-flush is debounced and serializes writes per path,
 * which is enough for a single-tab single-process agent.
 */
export class NodeFsBackend implements AgentFs.Backend {
  constructor(private readonly baseDir: string) {}

  private resolve(p: string): string {
    if (!p.startsWith("/")) {
      throw new Error(`agent-fs path must start with "/": ${p}`);
    }
    // Normalize to disk path. `path.join` handles the rest; the leading
    // slash is stripped because join treats it as part of the segment.
    return path.join(this.baseDir, ...p.slice(1).split("/"));
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    await walk(this.baseDir, this.baseDir, out);
    return out;
  }

  async read(p: string): Promise<string | null> {
    try {
      return await fs.readFile(this.resolve(p), "utf8");
    } catch (err: unknown) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async write(p: string, content: string): Promise<void> {
    const full = this.resolve(p);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
  }

  async delete(p: string): Promise<void> {
    try {
      await fs.rm(this.resolve(p));
    } catch (err: unknown) {
      if (isNotFound(err)) return;
      throw err;
    }
  }
}

async function walk(base: string, dir: string, out: string[]): Promise<void> {
  let entries: { name: string; isDir: boolean }[];
  try {
    const raw = await fs.readdir(dir, { withFileTypes: true });
    entries = raw.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
  } catch (err) {
    if (isNotFound(err)) return;
    throw err;
  }
  const dirs: string[] = [];
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDir) {
      dirs.push(full);
    } else {
      const rel = path.relative(base, full);
      out.push("/" + rel.split(path.sep).join("/"));
    }
  }
  // Descend into subdirectories in parallel — O(depth) round trips
  // instead of O(entries) when the tree is wide.
  await Promise.all(dirs.map((d) => walk(base, d, out)));
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
