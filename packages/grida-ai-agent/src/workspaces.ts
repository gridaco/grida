/**
 * GRIDA-SEC-004 — workspace registry.
 *
 * A workspace is an opened directory. Single-root in V1.x (multi-root
 * is V2). Persisted at `${userData}/workspaces.json` with the same
 * atomic-write + 0o600 pattern as `recent.json` / `auth.json`.
 *
 * On `open(path)`, we resolve the path:
 *   1. `realpath` it (collapses `..`, follows symlinks, normalises
 *      trailing slashes) so two opens of the same directory return
 *      the same workspace id even if the user typed slightly different
 *      strings.
 *   2. Walk up looking for a `.git` entry. If found, the workspace's
 *      `root` is the git repo root, not the originally-opened
 *      subdirectory. Opening `~/code/grida/src` registers
 *      `~/code/grida` as the workspace.
 *
 * Workspace id is the first 16 hex chars of `sha256(realRoot)` —
 * stable across launches as long as the path doesn't move on disk. A
 * moved workspace re-registers under a new id (and loses `pinned`);
 * tracking moves via inode is V2 polish.
 *
 * The client never sees absolute paths through this surface — wait,
 * yes it does, in `Workspace.root`. Unlike `/files/*` where the
 * client talks in opaque docIds, workspaces are inherently
 * user-facing ("you opened /Users/x/Documents/grida"). The display
 * path is the file-name in this surface. Hiding it would break
 * "Recent Workspaces" UX.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "./storage/atomic-write";

export type Workspace = {
  /** sha256(realRoot).slice(0,16) — stable across launches. */
  id: string;
  /** Absolute, realpath'd root directory. May differ from the path the
   * caller passed if the caller pointed at a subdirectory of a git repo. */
  root: string;
  /** `basename(root)`. Display label; client may override. */
  name: string;
  opened_at: number;
  pinned: boolean;
};

const FILE_NAME = "workspaces.json";
const MAX_ENTRIES = 100;

export class WorkspaceRegistry {
  private entries: Workspace[] = [];
  private loaded = false;
  private readonly file_path: string;

  constructor(userDataPath: string) {
    this.file_path = path.join(userDataPath, FILE_NAME);
  }

  /**
   * Lazy-load on first access — same pattern as `RecentStore`. A
   * corrupt file silently resets to empty; a "Recent Workspaces" list
   * is not load-bearing and a hand-edit-the-JSON-to-recover UX would
   * be hostile.
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.file_path, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed.filter(
          (e): e is Workspace =>
            e !== null &&
            typeof e === "object" &&
            typeof e.id === "string" &&
            typeof e.root === "string" &&
            typeof e.name === "string" &&
            typeof e.opened_at === "number" &&
            typeof e.pinned === "boolean"
        );
      }
    } catch {
      this.entries = [];
    }
  }

  private async persist(): Promise<void> {
    await atomicWrite(this.file_path, JSON.stringify(this.entries));
  }

  /**
   * Register an opened directory. Idempotent: opening the same path
   * twice returns the same workspace (updating `openedAt`). Git-root
   * expansion happens here — see file header.
   *
   * Throws if the path doesn't exist or isn't a directory.
   */
  async open(rootPath: string): Promise<Workspace> {
    const real = await fs.realpath(rootPath);
    const stat = await fs.stat(real);
    if (!stat.isDirectory()) {
      throw new Error(`workspace path is not a directory: ${rootPath}`);
    }
    const gitRoot = await findGitRoot(real);
    const resolvedRoot = gitRoot ?? real;
    const id = crypto
      .createHash("sha256")
      .update(resolvedRoot)
      .digest("hex")
      .slice(0, 16);

    await this.ensureLoaded();
    const now = Date.now();
    const idx = this.entries.findIndex((e) => e.id === id);
    let entry: Workspace;
    if (idx >= 0) {
      entry = { ...this.entries[idx], opened_at: now };
      this.entries.splice(idx, 1);
    } else {
      entry = {
        id,
        root: resolvedRoot,
        name: path.basename(resolvedRoot) || resolvedRoot,
        opened_at: now,
        pinned: false,
      };
    }
    this.entries.unshift(entry);
    this.trim();
    await this.persist();
    return entry;
  }

  /** Most-recent-first. Defensive copy — callers may mutate. */
  async list(): Promise<Workspace[]> {
    await this.ensureLoaded();
    return this.entries.slice();
  }

  /**
   * Lookup by id. Returns `null` when no workspace matches — every
   * fs/agent route needs this to surface a typed 404.
   */
  async findById(id: string): Promise<Workspace | null> {
    await this.ensureLoaded();
    return this.entries.find((e) => e.id === id) ?? null;
  }

  /**
   * Lookup by canonical root path. Used by the agent runner to find
   * the workspace the route handler already resolved by id.
   */
  async findByRoot(root: string): Promise<Workspace | null> {
    await this.ensureLoaded();
    return this.entries.find((e) => e.root === root) ?? null;
  }

  async pin(id: string, pinned: boolean): Promise<void> {
    await this.ensureLoaded();
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx < 0) return;
    this.entries[idx] = { ...this.entries[idx], pinned };
    await this.persist();
  }

  async forget(id: string): Promise<void> {
    await this.ensureLoaded();
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    if (this.entries.length !== before) await this.persist();
  }

  /**
   * Sync check: is `absPath` under any currently-registered workspace?
   * Used by the shell runner to validate that a child process's cwd
   * sits inside an opened workspace. Compares using
   * `path` semantics — caller must pass an already-`realpath`'d
   * absolute path for a robust check (otherwise symlinks slip through).
   */
  containsPath(absPath: string): boolean {
    // Caller guarantees loaded — this is a sync check used in routes
    // where the list has already been touched on this request.
    for (const w of this.entries) {
      // Use `path.sep`-terminated prefix match to avoid false positives
      // like `/Users/x/docs2` matching workspace `/Users/x/docs`.
      const prefix = w.root.endsWith(path.sep) ? w.root : w.root + path.sep;
      if (absPath === w.root || absPath.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  /** Snapshot of currently-registered workspace roots. */
  rootsSnapshot(): readonly string[] {
    return this.entries.map((e) => e.root);
  }

  /**
   * Cap to MAX_ENTRIES. Pinned entries are never evicted; among
   * un-pinned, most-recently-opened wins.
   */
  private trim(): void {
    if (this.entries.length <= MAX_ENTRIES) return;
    const pinned = this.entries.filter((e) => e.pinned);
    const unpinned = this.entries.filter((e) => !e.pinned);
    const room = Math.max(0, MAX_ENTRIES - pinned.length);
    const keptUnpinned = unpinned.slice(0, room);
    this.entries = [...pinned, ...keptUnpinned].sort(
      (a, b) => b.opened_at - a.opened_at
    );
  }
}

// ─────────────────────────── git-root walk ───────────────────────────
/**
 * Walk up from a starting path looking for a `.git` entry (directory
 * for a normal repo, file for a worktree linked to a parent). Returns
 * the absolute path of the directory containing `.git`, or `null` if
 * none is found before reaching the filesystem root.
 *
 * Opening `src/` should expand to the repo root so the workspace's
 * read/write scope covers the whole project, not just the subdirectory
 * the user happened to point at.
 *
 * No external dep — `simple-git` etc. would be overkill for what is
 * effectively three `fs.stat` calls in the average case.
 */

export async function findGitRoot(startPath: string): Promise<string | null> {
  let current = path.resolve(startPath);
  // Bound the walk so a deeply pathological path can't loop forever
  // (path.dirname eventually reaches a fixed point, but the explicit
  // depth cap is the kind of belt-and-suspenders that pays off).
  for (let depth = 0; depth < 64; depth++) {
    try {
      const gitPath = path.join(current, ".git");
      const stat = await fs.stat(gitPath);
      // `.git` can be a directory (normal repo) OR a file (git worktree
      // link). Both count — what matters is "this is where the project
      // boundary sits."
      if (stat.isDirectory() || stat.isFile()) {
        return current;
      }
    } catch {
      // ENOENT — not a git dir at this level; keep walking up.
    }
    const parent = path.dirname(current);
    if (parent === current) return null; // hit filesystem root
    current = parent;
  }
  return null;
}

// `workspaceFs` is NOT re-exported here (de-barreled): import it directly
// from "./workspaces/fs". This file owns the registry + git-root walk only.
