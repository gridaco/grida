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

/**
 * A field-constrained board seed for {@link WorkspaceRegistry.createProject}.
 * Deliberately NOT a raw dotcanvas manifest — only a document's `src` (a
 * bundle-relative path or an `https://` reference) and an optional layout box.
 * Keeping the shape this narrow is what stops the `/workspaces/create` route
 * from being a manifest-injection vector (GRIDA-SEC-004).
 */
export type ProjectSeedDocument = {
  src: string;
  layout?: { x?: number; y?: number; w?: number; h?: number; z?: number };
};
export type ProjectSeed = { documents: ProjectSeedDocument[] };

const FILE_NAME = "workspaces.json";
const MAX_ENTRIES = 100;

/**
 * The dotcanvas manifest filename (mirrors `dotcanvas.MANIFEST_FILENAME`).
 * Inlined rather than imported so the sidecar doesn't pull in the whole
 * `dotcanvas` package just to write a two-key seed — the shape below is the
 * stable v1 contract the reader heals against.
 */
const MANIFEST_FILENAME = ".canvas.json";

/**
 * The dotcanvas bundle directory extension (mirrors `dotcanvas.BUNDLE_EXTENSION`).
 * A bundle is a *directory* whose name ends with this — the macOS-package
 * convention. Naming the seeded dir `<name>.canvas` is what makes the board
 * RECOGNIZABLE: the file tree renders it as an openable bundle
 * (`dotcanvas.isBundlePath`) and the workbench opens it as a board tab. A bare
 * `.canvas.json` at the workspace root would just be a JSON file to the tree.
 * Inlined (not imported) for the same reason as {@link MANIFEST_FILENAME}.
 */
const BUNDLE_EXTENSION = ".canvas";

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
   * GRIDA-SEC-004 — auto-create a fresh project: mint a new directory under the
   * host-injected {@link projects_root}, seed it with a real `.canvas` bundle
   * (a `<name>.canvas` dir + manifest), and register it (via {@link open}, so id/name/persistence rules
   * stay single-sourced). Powers the desktop home's "auto-create, ask nothing"
   * flow — clicking a template or picking a reference lands the user in a board
   * without ever choosing a folder.
   *
   * Safety (never trust the caller for a path):
   *   - `name` is SLUGIFIED to a single filesystem segment — path separators,
   *     `..`, NUL, and control chars can't survive, so it can never be a path.
   *   - the created dir is `realpath`'d and asserted to sit under the (also
   *     `realpath`'d) managed root; anything else is removed and rejected.
   *   - the `seed` is field-constrained ({@link ProjectSeed}) — only `src` +
   *     an optional layout box reach the manifest, never a raw manifest.
   *
   * Throws `projects-root-not-configured` on a host that didn't wire a root.
   */
  async createProject(opts: {
    name?: string;
    seed?: ProjectSeed;
  }): Promise<Workspace> {
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

    // The project is a plain workspace CONTAINER that holds a real dotcanvas
    // BUNDLE — a `<name>.canvas` directory with the manifest inside it — NOT a
    // loose `.canvas.json` at the root. That distinction is what makes the board
    // recognizable: the file tree shows the `.canvas` dir as an openable bundle
    // (`dotcanvas.isBundlePath`) and the workbench opens it as a board tab; a
    // root-level manifest is just JSON to the tree. Keeping the manifest OUT of
    // the workspace root also means the reopen path (menu/⌃R, which sniff root
    // `.canvas.json`) lands on the workbench too, matching the create flow.
    const bundleDir = path.join(
      realDir,
      `${path.basename(realDir)}${BUNDLE_EXTENSION}`
    );
    await fs.mkdir(bundleDir, { recursive: false });
    await atomicWrite(
      path.join(bundleDir, MANIFEST_FILENAME),
      buildSeedManifest(opts.seed),
      { mode: 0o644 }
    );

    // Register through `open` so the id (sha256(realpath)[:16]) and recents
    // bookkeeping stay identical to a user-opened folder.
    return this.open(realDir);
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
 * Reduce a user/prompt-supplied project name to a single, safe filesystem
 * segment. Strips control chars + NUL, turns path separators into spaces,
 * collapses whitespace, drops leading dots (so `.`/`..`/hidden names can't
 * form), and caps length. Empty result → "Untitled". The realpath-containment
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
    out += ch === "/" || ch === "\\" ? " " : ch;
  }
  const cleaned = out
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "") // no leading dots (., .., hidden names)
    .trim()
    .slice(0, 60)
    .trim();
  return cleaned || "Untitled";
}

/**
 * Serialize a `.canvas` board manifest for a freshly-created project. Mirrors
 * the dotcanvas v1 board shape (see `fixtures/test-canvas/board.canvas`): an
 * `https://` `src` is a first-class placed reference (used as-is), a relative
 * `src` is a bundle file. Only `src` + an optional layout box are emitted — the
 * seed is field-constrained upstream, so nothing else can reach disk.
 */
function buildSeedManifest(seed?: ProjectSeed): string {
  const documents = (seed?.documents ?? []).map((d) => ({
    src: d.src,
    ...(d.layout ? { layout: d.layout } : {}),
  }));
  const manifest = {
    $schema: "https://grida.co/schema/dotcanvas/v1.json",
    version: "1",
    editor: "board",
    documents,
  };
  return JSON.stringify(manifest, null, 2) + "\n";
}

// `workspaceFs` is NOT re-exported here (de-barreled): import it directly
// from "./workspaces/fs". This file owns the registry only.
