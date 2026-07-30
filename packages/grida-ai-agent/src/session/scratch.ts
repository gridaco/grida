/**
 * Session scratch — the per-session, system-managed, ephemeral filesystem area
 * an agent uses as working space and the default home for what it produces (WG
 * RFC `docs/wg/ai/agent/scratch.md`; RFD gridaco/grida#916).
 *
 * Split per the SDK-design doctrine ($sdk-design D2):
 *   - PURE derivation (`scratchRootFor`, `assertOutsideSecretsRoot`) — path-in →
 *     path-out, no I/O, headlessly testable. These carry the package-owned
 *     INVARIANTS the host cannot override: per-session isolation (S1) and the
 *     refusal to sit inside the host's secret root (S4 containment).
 *   - AUTHORITY I/O (`prepareScratchAuthority`, `ensureScratch`,
 *     `removeScratch`, `sweepScratch`) — fail-closed ownership/mode checks plus
 *     bounded creation and cleanup wired into the session lifecycle.
 *
 * WHERE scratch physically lives is host-owned I/O: the host injects a `base`
 * and the default (`defaultScratchBase`) is resolved at the host/CLI entrypoint
 * seam, never deep in the runtime. The package owns only the invariants above —
 * it does NOT own filesystem-location policy. See the RFC bindings table.
 *
 * Scratch must live OUTSIDE the agent host's `userData` (the GRIDA-SEC-004
 * secret root): a shell arg resolving inside that root is rejected by the shell
 * runner, so a scratch dir nested there would be unreachable. The OS temp area
 * is both outside the secret root and naturally ephemeral.
 */

import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rm,
  unlink,
} from "node:fs/promises";
import {
  chmodSync,
  constants as fsConstants,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import type { Stats } from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { containsPath } from "@grida/daemon/server";

/** Where every session's scratch dir lives under a `base`. */
const SESSIONS_DIRNAME = "sessions";
const SCRATCH_DIRNAME = "scratch";
const SCRATCH_NAMESPACE = "grida-agent";

/**
 * Owner-only (`rwx------`) mode for every scratch dir we create. On a shared
 * Unix machine the default base (`<os.tmpdir()>/grida-agent`) can resolve under
 * a world-traversable `/tmp`, so without this another local account could list
 * the sessions tree and read produced/extracted artifacts. Creation requests
 * this mode, then chmod + lstat verify it on every authority level.
 */
const SCRATCH_DIR_MODE = 0o700;

/** Owner-only (`rw-------`) mode for files we write into scratch — same
 *  shared-machine reasoning as {@link SCRATCH_DIR_MODE}. */
const SCRATCH_FILE_MODE = 0o600;

function isErrno(err: unknown, code: NodeJS.ErrnoException["code"]): boolean {
  return (err as NodeJS.ErrnoException).code === code;
}

function scratchAuthorityError(target: string, reason: string): Error {
  return new Error(`unsafe scratch authority at ${target}: ${reason}`);
}

function currentUid(): number | undefined {
  return process.platform === "win32" || typeof process.getuid !== "function"
    ? undefined
    : process.getuid();
}

/**
 * Resolve a host-provided authority path once and reject broad/unstable
 * targets. Scratch locations are host-owned absolute paths; accepting `/`
 * would let the mode-tightening below chmod the filesystem root.
 */
function resolveAuthorityBase(base: string): string {
  if (!path.isAbsolute(base)) {
    throw scratchAuthorityError(base, "the base must be an absolute path");
  }
  const resolved = path.resolve(base);
  if (path.dirname(resolved) === resolved) {
    throw scratchAuthorityError(base, "the filesystem root cannot be a base");
  }
  return resolved;
}

/**
 * A local account must not be able to rename or replace the authority entry
 * through its parent. A group-/other-writable parent is safe only with the
 * sticky bit (the normal `/tmp` contract). This is a POSIX ownership boundary;
 * Windows does not expose equivalent uid/mode semantics through Node.
 */
function assertSafeParent(parent: string, stat: Stats): void {
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw scratchAuthorityError(
      parent,
      "the parent must be a non-symlink directory"
    );
  }
  const uid = currentUid();
  if (uid === undefined) return;
  if (stat.uid !== uid && stat.uid !== 0) {
    throw scratchAuthorityError(
      parent,
      `parent uid ${stat.uid} is neither process uid ${uid} nor privileged uid 0`
    );
  }
  const groupOrOtherWritable = (stat.mode & 0o022) !== 0;
  const sticky = (stat.mode & 0o1000) !== 0;
  if (groupOrOtherWritable && !sticky) {
    throw scratchAuthorityError(
      parent,
      "the parent is group/other-writable without the sticky bit"
    );
  }
}

function assertOwnedDirectory(target: string, stat: Stats): void {
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw scratchAuthorityError(target, "expected a non-symlink directory");
  }
  const uid = currentUid();
  if (uid !== undefined && stat.uid !== uid) {
    throw scratchAuthorityError(
      target,
      `directory uid ${stat.uid} does not match process uid ${uid}`
    );
  }
}

function verifyPrivateMode(target: string, stat: Stats): void {
  if (currentUid() !== undefined && (stat.mode & 0o777) !== SCRATCH_DIR_MODE) {
    throw scratchAuthorityError(
      target,
      `directory mode is ${(stat.mode & 0o777).toString(8)}, expected 700`
    );
  }
}

/**
 * Establish one authority directory without following a final symlink.
 *
 * The parent is inspected BEFORE mkdir. Creation is deliberately
 * non-recursive: no unchecked intermediate can be created or followed on the
 * way to a predictable temp path. On POSIX, an existing directory must belong
 * to this uid; then chmod + a second lstat make 0700 a verified postcondition
 * rather than a best-effort creation hint.
 */
function ensurePrivateDirectorySync(target: string): void {
  const parent = path.dirname(target);
  let parentStat: Stats;
  try {
    parentStat = lstatSync(parent);
  } catch (err) {
    throw scratchAuthorityError(
      parent,
      `cannot inspect parent (${(err as NodeJS.ErrnoException).code ?? "unknown error"})`
    );
  }
  assertSafeParent(parent, parentStat);

  try {
    mkdirSync(target, { mode: SCRATCH_DIR_MODE, recursive: false });
  } catch (err) {
    if (!isErrno(err, "EEXIST")) throw err;
  }

  let stat = lstatSync(target);
  assertOwnedDirectory(target, stat);
  if (currentUid() !== undefined) {
    chmodSync(target, SCRATCH_DIR_MODE);
    stat = lstatSync(target);
    assertOwnedDirectory(target, stat);
    verifyPrivateMode(target, stat);
  }
}

async function ensurePrivateDirectory(target: string): Promise<void> {
  const parent = path.dirname(target);
  let parentStat: Stats;
  try {
    parentStat = await lstat(parent);
  } catch (err) {
    throw scratchAuthorityError(
      parent,
      `cannot inspect parent (${(err as NodeJS.ErrnoException).code ?? "unknown error"})`
    );
  }
  assertSafeParent(parent, parentStat);

  try {
    await mkdir(target, { mode: SCRATCH_DIR_MODE, recursive: false });
  } catch (err) {
    if (!isErrno(err, "EEXIST")) throw err;
  }

  let stat = await lstat(target);
  assertOwnedDirectory(target, stat);
  if (currentUid() !== undefined) {
    await chmod(target, SCRATCH_DIR_MODE);
    stat = await lstat(target);
    assertOwnedDirectory(target, stat);
    verifyPrivateMode(target, stat);
  }
}

function realpathNearestSync(p: string): string {
  let current = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try {
      const real = realpathSync(current);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch (err) {
      if (!isErrno(err, "ENOENT") && !isErrno(err, "ENOTDIR")) {
        throw err;
      }
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(p);
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

function assertAuthorityOutsideSecretsSync(
  base: string,
  secretsRoot: string | undefined
): void {
  if (!secretsRoot) return;
  assertOutsideSecretsRoot(base, secretsRoot);
  if (containsPath(path.resolve(base), path.resolve(secretsRoot))) {
    throw new Error(
      `scratch base must not contain the secret root (GRIDA-SEC-004): ${base}`
    );
  }
  const realBase = realpathNearestSync(base);
  const realSecrets = realpathNearestSync(secretsRoot);
  if (
    containsPath(realSecrets, realBase) ||
    containsPath(realBase, realSecrets)
  ) {
    throw new Error(
      `scratch base physically overlaps the secret root (GRIDA-SEC-004): ${base}`
    );
  }
}

/**
 * Synchronously establish the shared scratch authority, without deleting any
 * session data. Native hosts may call this before touching another private
 * child such as `<base>/commands`.
 *
 * The base and `sessions` are both non-symlink, current-uid-owned 0700
 * directories on POSIX. A predictable path pre-created by another local uid,
 * a symlink aimed elsewhere, or physical overlap with `secretsRoot` fails
 * closed before any mode or content mutation.
 */
export function prepareScratchAuthority(
  base: string,
  secretsRoot?: string
): void {
  const resolvedBase = resolveAuthorityBase(base);
  assertAuthorityOutsideSecretsSync(resolvedBase, secretsRoot);
  ensurePrivateDirectorySync(resolvedBase);
  ensurePrivateDirectorySync(path.join(resolvedBase, SESSIONS_DIRNAME));
}

/**
 * Default base directory for session scratch areas when the host injects none.
 * `<tempRoot>/grida-agent-<host-tag>`, where `tempRoot` defaults to
 * `os.tmpdir()` and the tag is a short hash of the host's `userData` dir.
 * Resolved at the host/server boundary (the thin adapter shell), so the runtime
 * core never names a temp path itself — a host with a narrower filesystem
 * reality may inject its own temp authority root.
 *
 * Namespaced PER HOST so two default-configured hosts on the same machine (e.g.
 * a desktop sidecar and a `cli serve`) don't share a base — otherwise one host's
 * start-time {@link sweepScratch} would wipe the other's live session scratch.
 * The tag is stable across restarts of the same host (same `userData`), so the
 * sweep still reclaims that host's prior-run scratch.
 */
export function defaultScratchBase(
  userDataPath: string,
  tempRoot: string = os.tmpdir()
): string {
  const tag = crypto
    .createHash("sha256")
    .update(path.resolve(userDataPath))
    .digest("hex")
    .slice(0, 16);
  return path.join(tempRoot, `${SCRATCH_NAMESPACE}-${tag}`);
}

/**
 * A session id that is safe to embed as a single path segment. Session ids the
 * package mints are `ses_<base62>` (see `ids.ts`), but `req.session_id` is
 * client-supplied, so this guards the S1 isolation invariant at the derivation
 * point: a separator or traversal segment could otherwise let one session's
 * scratch escape its own subtree. Anything outside `[A-Za-z0-9_-]` is rejected.
 */
function assertSafeSessionId(sessionId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    throw new Error(`unsafe session id for scratch path: ${sessionId}`);
  }
}

/**
 * Derive a session's scratch root under `base`. PURE — no I/O.
 *
 * `<base>/sessions/<session-id>/scratch`. The per-session subpath shape is owned
 * by the package (S1: one session cannot reach another's, because each is handed
 * only its own subtree); the host chooses only `base`.
 */
export function scratchRootFor(base: string, sessionId: string): string {
  assertSafeSessionId(sessionId);
  return path.join(base, SESSIONS_DIRNAME, sessionId, SCRATCH_DIRNAME);
}

/**
 * Assert a scratch root is NOT inside the host's secret root (S4 containment).
 * PURE. Reuses the shared `path.sep`-prefix {@link containsPath}, so a sibling
 * like `${secretsRoot}-x` never counts as inside. Throws when the invariant is
 * violated — a misconfigured base that nests scratch in `userData` is a
 * programming error, not a runtime condition.
 */
export function assertOutsideSecretsRoot(
  scratchRoot: string,
  secretsRoot: string | undefined
): void {
  if (!secretsRoot) return;
  if (containsPath(path.resolve(secretsRoot), path.resolve(scratchRoot))) {
    throw new Error(
      `scratch root must not be inside the secret root (GRIDA-SEC-004): ${scratchRoot}`
    );
  }
}

/**
 * Realpath `p` if it exists, otherwise realpath its nearest existing ancestor
 * and re-join the missing tail — so a symlinked ancestor resolves to its real
 * target even when the leaf doesn't exist yet. Mirrors the shell runner's cwd
 * discipline (`realpathNearest` there).
 */
async function realpathNearest(p: string): Promise<string> {
  let current = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try {
      const real = await realpath(current);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch (err) {
      if (!isErrno(err, "ENOENT") && !isErrno(err, "ENOTDIR")) {
        throw err;
      }
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(p);
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

function parseScratchRoot(scratchDir: string): {
  base: string;
  sessionDir: string;
  scratchDir: string;
} {
  if (!path.isAbsolute(scratchDir)) {
    throw scratchAuthorityError(
      scratchDir,
      "the scratch root must be an absolute path"
    );
  }
  const resolvedScratch = path.resolve(scratchDir);
  if (path.basename(resolvedScratch) !== SCRATCH_DIRNAME) {
    throw scratchAuthorityError(
      scratchDir,
      `expected the final path segment to be ${SCRATCH_DIRNAME}`
    );
  }
  const sessionDir = path.dirname(resolvedScratch);
  assertSafeSessionId(path.basename(sessionDir));
  const sessionsDir = path.dirname(sessionDir);
  if (path.basename(sessionsDir) !== SESSIONS_DIRNAME) {
    throw scratchAuthorityError(
      scratchDir,
      `expected the session parent to be ${SESSIONS_DIRNAME}`
    );
  }
  return {
    base: resolveAuthorityBase(path.dirname(sessionsDir)),
    sessionDir,
    scratchDir: resolvedScratch,
  };
}

/**
 * Create a scratch dir on demand, owner-only. Idempotent. Takes the
 * already-derived absolute dir (from {@link scratchRootFor}) so the path isn't
 * computed twice — the caller holds it for the agent binding anyway.
 *
 * Containment (GRIDA-SEC-004) is checked in TWO layers: a cheap lexical
 * pre-check ({@link assertOutsideSecretsRoot}), then an AUTHORITATIVE physical
 * check — realpath the nearest existing ancestor of both paths before creating
 * anything, so a SYMLINKED base that resolves back inside the secret root is
 * rejected (a lexical check alone is bypassable, and the shell later realpaths
 * this dir when accepting it as a cwd). Nothing is created when the check fails.
 */
export async function ensureScratch(
  scratchDir: string,
  secretsRoot?: string
): Promise<void> {
  assertOutsideSecretsRoot(scratchDir, secretsRoot);
  const authority = parseScratchRoot(scratchDir);
  if (secretsRoot) {
    const realScratch = await realpathNearest(authority.scratchDir);
    const realSecrets = await realpathNearest(secretsRoot);
    if (containsPath(realSecrets, realScratch)) {
      throw new Error(
        `scratch root resolves inside the secret root (GRIDA-SEC-004): ${scratchDir}`
      );
    }
  }
  prepareScratchAuthority(authority.base, secretsRoot);
  await ensurePrivateDirectory(authority.sessionDir);
  await ensurePrivateDirectory(authority.scratchDir);
}

/**
 * Reject a filename that is not a single safe path segment. A produced-file
 * name (e.g. from `generate_image`'s `filename` arg) is partly model-/client-
 * controlled, so a separator or traversal segment could otherwise write outside
 * the session's own scratch subtree (the S1 isolation invariant, at the write
 * point). Anything with a separator, NUL, or a bare `.`/`..` is rejected.
 */
function assertSafeFilename(filename: string): void {
  if (
    filename === "" ||
    filename === "." ||
    filename === ".." ||
    /[/\\]/.test(filename) ||
    filename.includes("\0")
  ) {
    throw new Error(`unsafe scratch filename: ${JSON.stringify(filename)}`);
  }
}

/**
 * Write bytes into a session's scratch dir as a single file and return its
 * absolute path. THIN I/O — assumes {@link ensureScratch} already created the
 * dir (the runtime does, before the turn). The file is owner-only
 * ({@link SCRATCH_FILE_MODE}); `filename` must be one safe segment
 * ({@link assertSafeFilename}), and the joined path is re-checked to sit
 * directly inside `scratchDir` as a belt-and-braces guard. Used by the host's
 * media-generation binding (`generate_image`) to land produced bytes in the
 * default sink (S3).
 *
 * The write is `O_NOFOLLOW`: if the final path component is already a symlink
 * (e.g. one planted by an auto-approved `run_command` whose cwd is scratch),
 * the open fails with `ELOOP` rather than following it and writing the bytes
 * outside the session tree — a TOCTOU that the lexical checks above can't catch
 * (#920 review). `O_NOFOLLOW` is POSIX-only; on Windows it is absent (the `?? 0`
 * fallback), where scratch's owner-only model is already a no-op.
 *
 * Generated artifacts keep the default overwrite behavior. Caller-supplied
 * turn seeds pass `{ overwrite: false }`, which adds `O_EXCL`: a replay or
 * colliding upload then fails before it can truncate a path already correlated
 * with durable history.
 */
export async function writeScratchFile(
  scratchDir: string,
  filename: string,
  bytes: Uint8Array,
  opts: { overwrite?: boolean } = {}
): Promise<string> {
  assertSafeFilename(filename);
  const full = path.join(scratchDir, filename);
  if (path.dirname(path.resolve(full)) !== path.resolve(scratchDir)) {
    throw new Error(`scratch filename escapes the scratch dir: ${filename}`);
  }
  const collisionFlag =
    opts.overwrite === false ? fsConstants.O_EXCL : fsConstants.O_TRUNC;
  const handle = await open(
    full,
    fsConstants.O_WRONLY |
      fsConstants.O_CREAT |
      collisionFlag |
      (fsConstants.O_NOFOLLOW ?? 0),
    SCRATCH_FILE_MODE
  );
  try {
    await handle.write(bytes);
  } finally {
    await handle.close();
  }
  return full;
}

/**
 * Snapshot the currently live flat scratch paths for model-view liveness.
 * Direct regular files only: directories and symlinks are not operable
 * attachment bodies. Missing or unreadable scratch fails closed to an empty
 * set, because persisted descriptors are facts about a prior turn, not proof
 * that ephemeral bytes survived.
 */
export async function listScratchFilePaths(
  scratchDir: string
): Promise<ReadonlySet<string>> {
  try {
    const entries = await readdir(scratchDir, { withFileTypes: true });
    return new Set(
      entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(
        `[agent] scratch listing failed (${code ?? "unknown filesystem error"})`
      );
    }
    return new Set();
  }
}

async function removeAuthorityEntry(target: string): Promise<void> {
  let stat: Stats;
  try {
    stat = await lstat(target);
  } catch (err) {
    if (isErrno(err, "ENOENT")) return;
    throw err;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    await unlink(target);
    return;
  }
  assertOwnedDirectory(target, stat);
  await rm(target, { recursive: true, force: true });
}

function removeAuthorityEntrySync(target: string): void {
  let stat: Stats;
  try {
    stat = lstatSync(target);
  } catch (err) {
    if (isErrno(err, "ENOENT")) return;
    throw err;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    unlinkSync(target);
    return;
  }
  assertOwnedDirectory(target, stat);
  rmSync(target, { recursive: true, force: true });
}

/**
 * Remove a session's scratch subtree (the whole `<base>/sessions/<id>`, so no
 * empty session dir lingers). Recursive and idempotent — removing a session that
 * never allocated scratch is a no-op. Used on session delete (S2: durability is
 * by promotion, so reclaiming scratch never loses value).
 */
export async function removeScratch(
  base: string,
  sessionId: string,
  secretsRoot?: string
): Promise<void> {
  assertSafeSessionId(sessionId);
  const resolvedBase = resolveAuthorityBase(base);
  prepareScratchAuthority(resolvedBase, secretsRoot);
  await removeAuthorityEntry(
    path.join(resolvedBase, SESSIONS_DIRNAME, sessionId)
  );
}

/**
 * Reclaim ALL session scratch dirs under `base` (`<base>/sessions/*`).
 * SYNCHRONOUS by design: the host calls it at start BEFORE it begins serving
 * runs, so a freshly resumed session's `ensureScratch` can't race a still-running
 * async sweep that would delete the dir underneath it. A single-instance daemon's
 * prior in-flight scratch is dead after a restart, so this bounds scratch's
 * lifetime even across a crash (S2).
 *
 * The authority is established BEFORE listing or deletion. A symlinked base or
 * `sessions` root therefore fails closed without touching its target. Child
 * symlink entries are unlinked directly, never passed to recursive removal.
 * Once that shared authority is validated, one stale entry that cannot be
 * removed is logged and left in place without preventing reclamation of the
 * remaining independent session entries.
 */
export function sweepScratch(base: string, secretsRoot?: string): void {
  const resolvedBase = resolveAuthorityBase(base);
  prepareScratchAuthority(resolvedBase, secretsRoot);
  const sessionsDir = path.join(resolvedBase, SESSIONS_DIRNAME);
  const entries = readdirSync(sessionsDir);
  for (const name of entries) {
    try {
      removeAuthorityEntrySync(path.join(sessionsDir, name));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      console.warn(
        `[agent] scratch sweep failed for ${JSON.stringify(name)} (${code ?? "unknown filesystem error"}); continuing`
      );
    }
  }
}
