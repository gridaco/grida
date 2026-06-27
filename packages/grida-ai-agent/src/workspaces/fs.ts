/**
 * GRIDA-SEC-004 — workspace file I/O helpers.
 *
 * Owns guarded file operations for an already-opened workspace. The
 * registry owns which roots are opened; this module owns containment,
 * text/binary policy, and atomic writes inside those roots.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "../storage/atomic-write";
import type { Workspace } from "../workspaces";

// ─────────────────────────── workspace fs ───────────────────────────
/**
 * GRIDA-SEC-004 — workspace file I/O helpers.
 *
 * The client talks in `{workspaceId, relPath}` (NOT absolute paths)
 * for everything in `/workspaces/{readdir,readfile,writefile}`. We
 * resolve `relPath` against the workspace's `root` (which is itself
 * already-`realpath`'d by `WorkspaceRegistry.open`), then verify the
 * resulting absolute path is contained within the workspace.
 *
 * Containment is enforced twice for reads:
 *   1. After `path.resolve`, before touching disk — catches the
 *      easy `../../etc/passwd` case immediately, no fs round trip.
 *   2. After `fs.realpath` on the final target — catches the symlink
 *      case where the target's literal path looks fine but follows
 *      out of the workspace.
 *
 * Writes follow the same atomic temp-file + rename discipline as
 * `auth.json` / `recent.json` (same directory as target, randomized
 * name, mode 0o600, then rename).
 *
 * The "shell.run cwd must be inside a workspace" gate from `shell/`
 * uses the same `containsPath` semantics — kept consistent so a
 * relative path that's safe to read is also safe to spawn into.
 */

export namespace workspaceFs {
  /** Hard cap on a single read/write. Larger files surface as an error
   * rather than silently allocating tens of MB of buffer + JSON-encoded
   * string. The client is supposed to be reading source files —
   * 1 MiB is plenty for that, and binary blobs (PNGs, fonts, etc.) get
   * sensibly rejected as a side effect. */
  export const MAX_FILE_BYTES = 1_048_576; // 1 MiB

  export type ErrorCode =
    | "workspace-not-found"
    | "path-not-relative"
    | "path-contains-null"
    | "path-escapes-workspace"
    | "not-a-directory"
    | "not-a-file"
    | "file-too-large"
    | "file-not-utf8"
    | "modified-since";

  export type ErrorDetail = {
    code: ErrorCode;
    workspace_id?: string;
    rel_path?: string;
    size?: number;
    /**
     * Current on-disk mtime, set on `modified-since` so the client can
     * reconcile (reload / overwrite-with-this-as-the-new-baseline)
     * without a second round trip. Omitted when the expected file is
     * gone on disk (deleted out from under the caller).
     */
    mtime?: number;
  };

  /**
   * Thrown by {@link readDir}, {@link readFile}, {@link writeFile}, etc.
   * on any structured failure (path escape, not-a-directory, etc.). The
   * route handler translates these into 4xx JSON responses.
   *
   * ENOENT / EACCES from the underlying fs calls intentionally propagate
   * as plain Node errors so the route can surface them as 404 / 403 —
   * the structured codes above are reserved for agent-host-policy failures
   * (escape attempts, oversized files, non-text content), not for raw
   * OS errors.
   */
  export class Exception extends Error {
    constructor(public readonly detail: ErrorDetail) {
      super(detail.code);
      this.name = "WorkspaceFsException";
    }
  }

  export type Entry = {
    /** basename of the entry. */
    name: string;
    /** Relative path from workspace root, posix-style separators. */
    rel_path: string;
    kind: "file" | "directory" | "symlink" | "other";
  };

  /**
   * Lists immediate children of `relPath` inside `workspace`. Empty
   * `relPath` lists the workspace root.
   *
   * Sort: directories first, then files, both alphabetical
   * case-insensitive. Dotfiles ARE included — hiding them would be a
   * surprise for users opening source repos (`.git`, `.gitignore`,
   * `.env.example` etc. all matter at a glance). The client can fold
   * them visually if it wants.
   *
   * Symlinks are reported with `kind: 'symlink'` and a best-effort
   * target classification — clicking them in the tree is allowed but
   * the read call will re-verify containment of the realpath'd target,
   * so a symlink to `/etc/passwd` shows up in the listing but fails on
   * open.
   */
  export async function readDir(
    workspace: Workspace,
    relPath: string
  ): Promise<Entry[]> {
    const abs = await resolveInside(workspace, relPath, { must_exist: true });
    // No pre-stat — readdir itself surfaces ENOTDIR on a regular-file
    // target, so the stat would just be a redundant syscall + TOCTOU
    // window. Translate the error so the route still emits our
    // structured 4xx code.
    let dirents;
    try {
      dirents = await fs.readdir(abs, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException | undefined)?.code === "ENOTDIR") {
        throw new Exception({
          code: "not-a-directory",
          workspace_id: workspace.id,
          rel_path: relPath,
        });
      }
      throw err;
    }
    const entries: Entry[] = [];
    for (const dirent of dirents) {
      let kind: Entry["kind"];
      if (dirent.isDirectory()) kind = "directory";
      else if (dirent.isFile()) kind = "file";
      else if (dirent.isSymbolicLink()) kind = "symlink";
      else kind = "other";
      // Build a posix-style relPath even on Windows for client
      // consistency. The agent-host-side resolveInside uses path.resolve
      // (platform-aware) on write so this isn't a portability issue.
      const child =
        relPath === "" || relPath === "."
          ? dirent.name
          : `${relPath.replace(/\\/g, "/").replace(/\/+$/, "")}/${dirent.name}`;
      entries.push({ name: dirent.name, rel_path: child, kind });
    }
    entries.sort((a, b) => {
      if (a.kind === "directory" && b.kind !== "directory") return -1;
      if (b.kind === "directory" && a.kind !== "directory") return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return entries;
  }

  /**
   * Read a file's contents as UTF-8 text. Rejects files larger than
   * MAX_FILE_BYTES and files whose bytes don't round-trip through UTF-8
   * (i.e. binary).
   *
   * Returning a binary-detection error rather than the lossy
   * `replacement-char`-replaced text is intentional: the client wants
   * to tell the user "this is a binary file, I can't show it" and offer
   * a different affordance, not display gibberish.
   */
  export async function readFile(
    workspace: Workspace,
    relPath: string
  ): Promise<{ content: string; mtime: number }> {
    const abs = await resolveInside(workspace, relPath, { must_exist: true });
    const stat = await fs.stat(abs);
    if (!stat.isFile()) {
      throw new Exception({
        code: "not-a-file",
        workspace_id: workspace.id,
        rel_path: relPath,
      });
    }
    if (stat.size > MAX_FILE_BYTES) {
      throw new Exception({
        code: "file-too-large",
        workspace_id: workspace.id,
        rel_path: relPath,
        size: stat.size,
      });
    }
    const buf = await fs.readFile(abs);
    // Binary detection: a null byte in the first 8 KiB is a reliable
    // heuristic for non-text content. The encoder round-trip would
    // catch the rest, but null-byte short-circuits the common case
    // (executables, images, archives).
    const head = buf.subarray(0, Math.min(buf.length, 8192));
    for (const byte of head) {
      if (byte === 0) {
        throw new Exception({
          code: "file-not-utf8",
          workspace_id: workspace.id,
          rel_path: relPath,
        });
      }
    }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let content: string;
    try {
      content = decoder.decode(buf);
    } catch {
      throw new Exception({
        code: "file-not-utf8",
        workspace_id: workspace.id,
        rel_path: relPath,
      });
    }
    return { content, mtime: stat.mtimeMs };
  }

  /**
   * Read `relPath` as opaque bytes, returning the contents base64-
   * encoded along with size + mtime.
   *
   * Companion to `readFile` for the read-only image viewer: that path
   * deliberately refuses non-UTF-8 content (so a tab opening an
   * executable doesn't paint garbage), but the client DOES want
   * images. Keeping these on separate routes preserves the
   * "text-only → reject binary" guarantee of `readFile` while giving
   * known-safe content types (PNG/JPG/WebP/etc.) a path to the
   * client.
   *
   * The same size cap applies — large images aren't free to round-trip
   * through a JSON+base64 payload (≈33% overhead), and the workspace
   * pane is for *viewing*, not for handling 50 MB scan files. Callers
   * pick a smaller in-pane affordance for oversized assets.
   *
   * Mime detection lives on the client side: this function is
   * deliberately content-agnostic. The route fans out to whichever
   * viewer the client dispatches based on extension.
   */
  export async function readFileBytes(
    workspace: Workspace,
    relPath: string,
    opts?: { max_bytes?: number }
  ): Promise<{ base64: string; size: number; mtime: number }> {
    // The 1 MiB default suits the source-file viewer; callers that legitimately
    // serve larger binaries (e.g. the agent's `view_image`, up to its own
    // perception cap) raise it so a valid image isn't rejected as too-large.
    const maxBytes = opts?.max_bytes ?? MAX_FILE_BYTES;
    const abs = await resolveInside(workspace, relPath, { must_exist: true });
    const stat = await fs.stat(abs);
    if (!stat.isFile()) {
      throw new Exception({
        code: "not-a-file",
        workspace_id: workspace.id,
        rel_path: relPath,
      });
    }
    if (stat.size > maxBytes) {
      throw new Exception({
        code: "file-too-large",
        workspace_id: workspace.id,
        rel_path: relPath,
        size: stat.size,
      });
    }
    const buf = await fs.readFile(abs);
    return {
      base64: buf.toString("base64"),
      size: stat.size,
      mtime: stat.mtimeMs,
    };
  }

  /**
   * Write `content` to `relPath` atomically (temp + rename in the same
   * directory). Creates parent directories if needed. Returns the new
   * mtime so the client can update its conflict-detection state.
   *
   * Optimistic-concurrency guard (issue #805): when the caller passes
   * `expected_mtime` (the mtime it captured the last time it read or
   * wrote the file), the write is rejected with `modified-since` if the
   * file on disk has advanced past that token — an external writer (or
   * the agent) changed it in the meantime, and a blind write would
   * silently clobber that change with no conflict detection. The caller
   * resolves the conflict (reload from disk / overwrite anyway) and
   * retries. Omitting `expected_mtime` keeps the old last-writer-wins
   * behavior, so the agent's own writes and first-time creates are
   * unaffected.
   *
   * A file that was deleted out from under the caller (ENOENT while an
   * `expected_mtime` was supplied) is also a conflict — we don't
   * silently resurrect it under the old name.
   *
   * Note: we don't enforce MAX_FILE_BYTES on the write side — the
   * client can always re-read a file it just wrote, but a Monaco
   * buffer of 50MB is the user's problem to surface, not the agent host's
   * problem to silently truncate.
   */
  export async function writeFile(
    workspace: Workspace,
    relPath: string,
    content: string,
    options: { expected_mtime?: number } = {}
  ): Promise<{ mtime: number }> {
    // mustExist:false — we may be creating a new file. But the parent
    // dir must be inside the workspace, which `resolveInside` verifies
    // via the string-prefix check. `resolveWritableParent` then runs the
    // workspace-fs's own dir checks; that's why we don't lean on
    // `atomicWrite`'s ensureDir (it would mkdirp outside the workspace
    // policy boundary).
    const abs = await resolveInside(workspace, relPath, { must_exist: false });
    await resolveWritableParent(workspace, abs, relPath);
    // Optimistic-concurrency precondition (issue #805), enforced as
    // atomicWrite's `before_commit` hook so it runs immediately before the
    // rename that publishes the bytes — the check→replace gap is then a single
    // rename syscall, not the whole tmp-write. A mismatch (or an ENOENT: the
    // file was deleted out from under us) aborts the write before the rename;
    // atomicWrite removes the tmp it had staged. Omitting `expected_mtime`
    // keeps last-writer-wins, so agent writes / first creates are unaffected.
    const before_commit =
      options.expected_mtime === undefined
        ? undefined
        : async () => {
            // Plain Stats (not the bigint overload) — mtimeMs is a number that
            // round-trips through the JSON precondition token verbatim.
            let current: import("node:fs").Stats | undefined;
            try {
              current = await fs.stat(abs);
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
              // ENOENT → the expected file is gone; fall through to the
              // `!current` conflict rather than re-creating it blindly.
            }
            if (!current || current.mtimeMs !== options.expected_mtime) {
              throw new Exception({
                code: "modified-since",
                workspace_id: workspace.id,
                rel_path: relPath,
                mtime: current?.mtimeMs,
              });
            }
          };
    // User-owned content — default 0o644 instead of `auth.json`'s 0o600.
    await atomicWrite(abs, content, {
      ensure_dir: false,
      mode: 0o644,
      before_commit,
    });
    const stat = await fs.stat(abs);
    return { mtime: stat.mtimeMs };
  }

  /**
   * Delete a regular file inside the workspace. Uses the same realpath
   * containment as reads, so symlinks that leave the workspace are
   * rejected before `rm`.
   */
  export async function deleteFile(
    workspace: Workspace,
    relPath: string
  ): Promise<void> {
    const abs = await resolveInside(workspace, relPath, { must_exist: true });
    const stat = await fs.stat(abs);
    if (!stat.isFile()) {
      throw new Exception({
        code: "not-a-file",
        workspace_id: workspace.id,
        rel_path: relPath,
      });
    }
    await fs.rm(abs);
  }
}

// ──────────────────────────── private helpers ────────────────────────────

/**
 * Resolve `relPath` against `workspace.root` and verify containment.
 * Returns the absolute path (possibly non-existent if `mustExist:false`).
 *
 * The string-level check is done up front so an attack like `../../`
 * fails before any fs syscall. When `mustExist` is true, we additionally
 * `realpath` the target — this is what catches the
 * "/Users/x/ws/symlink-to-elsewhere" trick.
 *
 * The workspace's `root` is itself realpath'd by `WorkspaceRegistry`,
 * so the prefix comparison is canonical-to-canonical.
 */
async function resolveInside(
  workspace: Workspace,
  relPath: string,
  opts: { must_exist: boolean }
): Promise<string> {
  if (path.isAbsolute(relPath)) {
    throw new workspaceFs.Exception({
      code: "path-not-relative",
      workspace_id: workspace.id,
      rel_path: relPath,
    });
  }
  if (relPath.includes("\0")) {
    throw new workspaceFs.Exception({
      code: "path-contains-null",
      workspace_id: workspace.id,
      rel_path: relPath,
    });
  }
  // Allow empty/`.`/trailing slashes — they all resolve to the root.
  const candidate = path.resolve(workspace.root, relPath);
  const prefix = workspacePrefix(workspace);
  if (candidate !== workspace.root && !candidate.startsWith(prefix)) {
    throw new workspaceFs.Exception({
      code: "path-escapes-workspace",
      workspace_id: workspace.id,
      rel_path: relPath,
    });
  }
  if (opts.must_exist) {
    // realpath also fails fast with ENOENT — let that propagate as
    // a Node error so the route can surface a 404.
    const real = await fs.realpath(candidate);
    if (real !== workspace.root && !real.startsWith(prefix)) {
      throw new workspaceFs.Exception({
        code: "path-escapes-workspace",
        workspace_id: workspace.id,
        rel_path: relPath,
      });
    }
    return real;
  }
  return candidate;
}

function workspacePrefix(workspace: Workspace): string {
  return workspace.root.endsWith(path.sep)
    ? workspace.root
    : workspace.root + path.sep;
}

function assertInsideWorkspace(
  workspace: Workspace,
  absPath: string,
  relPath: string
): void {
  const prefix = workspacePrefix(workspace);
  if (absPath !== workspace.root && !absPath.startsWith(prefix)) {
    throw new workspaceFs.Exception({
      code: "path-escapes-workspace",
      workspace_id: workspace.id,
      rel_path: relPath,
    });
  }
}

/**
 * Resolve the parent directory for a write, guarding the symlink case
 * where the string path is under the workspace but an existing parent
 * component points outside it.
 */
async function resolveWritableParent(
  workspace: Workspace,
  absPath: string,
  relPath: string
): Promise<string> {
  const dir = path.dirname(absPath);
  assertInsideWorkspace(workspace, dir, relPath);

  let existing = dir;
  while (true) {
    try {
      const real = await fs.realpath(existing);
      assertInsideWorkspace(workspace, real, relPath);
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") throw err;
      const parent = path.dirname(existing);
      if (parent === existing) throw err;
      assertInsideWorkspace(workspace, parent, relPath);
      existing = parent;
    }
  }

  await fs.mkdir(dir, { recursive: true });
  const realDir = await fs.realpath(dir);
  assertInsideWorkspace(workspace, realDir, relPath);
  return realDir;
}
