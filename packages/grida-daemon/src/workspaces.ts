/**
 * GRIDA-SEC-004 — workspace registry.
 *
 * A workspace is an opened directory. Single-root in V1.x (multi-root
 * is V2). Persisted at `${userData}/workspaces.json` with the same
 * atomic-write + 0o600 pattern as `recent.json` / `auth.json`.
 *
 * On `open(path)`, we `realpath` it (collapses `..`, follows symlinks,
 * normalises trailing slashes) so two opens of the same directory return the
 * same workspace id even if the user typed slightly different strings. The
 * workspace root is then exactly that directory — we do NOT expand to a
 * containing git repo. Opening `~/code/grida/editor` registers `editor`, not
 * the whole repo: always respect what the user opened. (Git stays relevant to
 * future per-file features like a diff panel, but it must not redefine which
 * folder the user opened.)
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
import { containsPath } from "./path-contains";

export type Workspace = {
  /** sha256(realRoot).slice(0,16) — stable across launches. */
  id: string;
  /** Absolute, realpath'd directory the caller opened. */
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
  /**
   * GRIDA-SEC-004 — the host-injected managed root under which
   * {@link createProject} mints new project folders (desktop:
   * `~/Documents/Grida`). Host-owned, NEVER derived from client input — the
   * one writable root the auto-create path may touch. Undefined for hosts that
   * don't wire it (the CLI/dev daemon), where `createProject` throws.
   */
  private readonly projects_root?: string;

  constructor(userDataPath: string, projectsRoot?: string) {
    this.file_path = path.join(userDataPath, FILE_NAME);
    this.projects_root = projectsRoot;
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
   * twice returns the same workspace (updating `openedAt`). The root is
   * exactly the opened directory — no git-root expansion (see file header).
   *
   * Throws if the path doesn't exist or isn't a directory.
   */
  async open(rootPath: string): Promise<Workspace> {
    const real = await fs.realpath(rootPath);
    const stat = await fs.stat(real);
    if (!stat.isDirectory()) {
      throw new Error(`workspace path is not a directory: ${rootPath}`);
    }
    // The workspace root is exactly what the user opened — never expand to a
    // containing git repo. Always respect what the user opened, as-is.
    const resolvedRoot = real;
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

  /**
   * GRIDA-SEC-004 — auto-create a fresh project: mint a new EMPTY directory
   * under the host-injected {@link projects_root} and register it (via
   * {@link open}, so id/name/persistence rules stay single-sourced). Powers the
   * desktop home's "auto-create, ask nothing" flow — describing what you want
   * lands you in a project without ever choosing a folder.
   *
   * The project is deliberately EMPTY: no `.canvas` board, no manifest, no
   * document of any kind. Whether the workspace becomes a board, a slides deck,
   * or a tree of files is the AGENT's choice, made on its first turn (guided by
   * the advertised skills) — not the host's. A workspace is just a place to
   * work; the document is created by the agent. (Pre-seeding a `.canvas` here
   * is what mis-steered decks onto boards; deferring to the agent is the fix,
   * and it also removes the seed as a manifest-injection surface entirely.)
   *
   * Safety (never trust the caller for a path):
   *   - `name` is SLUGIFIED to a single filesystem segment — path separators,
   *     `..`, NUL, and control chars can't survive, so it can never be a path.
   *   - the created dir is `realpath`'d and asserted to sit under the (also
   *     `realpath`'d) managed root; anything else is removed and rejected.
   *
   * Throws `projects-root-not-configured` on a host that didn't wire a root.
   */
  async createProject(opts: { name?: string }): Promise<Workspace> {
    if (!this.projects_root) {
      throw new Error("projects-root-not-configured");
    }
    await fs.mkdir(this.projects_root, { recursive: true });
    const realRoot = await fs.realpath(this.projects_root);

    const slug = slugifyProjectName(opts.name);
    const dir = await this.mintProjectDir(realRoot, slug);

    // Containment assert (the one new trust check): the minted dir's realpath
    // MUST be STRICTLY under the managed root (`containsPath` also accepts
    // root-equals-root, which here would mean the mint escaped). Same shared
    // discipline as the shell runner's root gates and the scratch assert;
    // catches a symlinked root or any residual escape.
    const realDir = await fs.realpath(dir);
    if (!containsPath(realRoot, realDir) || realDir === realRoot) {
      await fs.rmdir(dir).catch(() => {});
      throw new Error("project-path-escapes-root");
    }

    // The project is an EMPTY workspace CONTAINER — just the directory. No
    // `.canvas` bundle, no manifest: the agent creates whatever document the
    // task calls for on its first turn (see the doc comment). The mint is
    // already on disk (`mintProjectDir` created it), so all that remains is to
    // register it.
    try {
      // Register through `open` so the id (sha256(realpath)[:16]) and recents
      // bookkeeping stay identical to a user-opened folder.
      return await this.open(realDir);
    } catch (err) {
      // Roll back the mint on any downstream failure (EACCES, disk full,
      // persist error) — otherwise an orphaned half-project lingers on disk,
      // unregistered, squatting the slug for the next create. Recursive rm is
      // safe here: `realDir` is containment-asserted above and we created it
      // fresh this call, so it holds nothing but our own empty dir.
      await fs.rm(realDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  /**
   * Create a uniquely-named directory under `realRoot`, suffixing `-2`, `-3`…
   * on collision. `fs.mkdir({recursive:false})` is atomic create-or-fail, so
   * two concurrent creates never hand back the same dir (no TOCTOU). Caps the
   * probe and falls back to a random suffix so a pathological name can't spin.
   */
  private async mintProjectDir(
    realRoot: string,
    slug: string
  ): Promise<string> {
    for (let i = 1; i <= 50; i++) {
      const name = i === 1 ? slug : `${slug}-${i}`;
      const dir = path.join(realRoot, name);
      try {
        await fs.mkdir(dir, { recursive: false });
        return dir;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
    }
    const dir = path.join(
      realRoot,
      `${slug}-${crypto.randomBytes(4).toString("hex")}`
    );
    await fs.mkdir(dir, { recursive: false });
    return dir;
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

/**
 * Characters that cannot appear in a folder segment on EVERY platform we mint
 * projects on. `/` and `\` are the traversal-relevant ones; the rest
 * (`< > : " | ? *`) are Windows-invalid — the name comes from a free-form
 * prompt ("Logo: coffee shop"), so ordinary punctuation must degrade to a
 * space instead of failing the primary create flow with an `fs.mkdir` error.
 */
const SEGMENT_UNSAFE_CHARS = new Set([
  "/",
  "\\",
  "<",
  ">",
  ":",
  '"',
  "|",
  "?",
  "*",
]);

/**
 * Reduce a user/prompt-supplied project name to a single, safe filesystem
 * segment. Strips control chars + NUL, turns path separators and
 * Windows-reserved punctuation into spaces, collapses whitespace, drops
 * leading and trailing dots (`.`/`..`/hidden names; Windows rejects trailing
 * dots), and caps length. Empty result → "Untitled". The realpath-containment
 * assert in {@link WorkspaceRegistry.createProject} is the backstop; this keeps
 * the common case readable AND the folder name never a traversal.
 */
function slugifyProjectName(name?: string): string {
  // Filter char-by-char (no control-char regex) so path separators, NUL, and
  // other control chars can never survive into a folder segment.
  let out = "";
  for (const ch of name ?? "") {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue; // control chars incl NUL
    out += SEGMENT_UNSAFE_CHARS.has(ch) ? " " : ch;
  }
  const cleaned = out
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "") // no leading dots (., .., hidden names)
    .replace(/\.+$/, "") // no trailing dots (Windows-invalid)
    .trim()
    .slice(0, 60)
    .trim()
    .replace(/\.+$/, ""); // the length cap can re-expose a trailing dot
  return cleaned || "Untitled";
}

// `workspaceFs` is NOT re-exported here (de-barreled): import it directly
// from "./workspaces/fs". This file owns the registry only.
