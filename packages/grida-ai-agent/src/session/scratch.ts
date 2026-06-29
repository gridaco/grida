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
 *   - THIN I/O (`ensureScratch`, `removeScratch`, `sweepScratch`) — mkdir/rm
 *     wrappers the runtime wires into the session lifecycle.
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

import { chmod, mkdir, rm, realpath, writeFile } from "node:fs/promises";
import { readdirSync, rmSync } from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { containsPath } from "../path-contains";

/** Where every session's scratch dir lives under a `base`. */
const SESSIONS_DIRNAME = "sessions";
const SCRATCH_DIRNAME = "scratch";
const SCRATCH_NAMESPACE = "grida-agent";

/**
 * Owner-only (`rwx------`) mode for every scratch dir we create. On a shared
 * Unix machine the default base (`<os.tmpdir()>/grida-agent`) can resolve under
 * a world-traversable `/tmp`, so without this another local account could list
 * the sessions tree and read produced/extracted artifacts. `mkdir` applies this
 * to each level it creates (subject to umask, which only removes bits).
 */
const SCRATCH_DIR_MODE = 0o700;

/** Owner-only (`rw-------`) mode for files we write into scratch — same
 *  shared-machine reasoning as {@link SCRATCH_DIR_MODE}. */
const SCRATCH_FILE_MODE = 0o600;

/**
 * Default base directory for session scratch areas when the host injects none.
 * `<os.tmpdir()>/grida-agent-<host-tag>`, where the tag is a short hash of the
 * host's `userData` dir. Resolved at the host/server boundary (the thin adapter
 * shell), so the runtime core never names a temp path itself — a future host
 * with a different filesystem reality (a cloud sandbox) injects its own.
 *
 * Namespaced PER HOST so two default-configured hosts on the same machine (e.g.
 * a desktop sidecar and a `cli serve`) don't share a base — otherwise one host's
 * start-time {@link sweepScratch} would wipe the other's live session scratch.
 * The tag is stable across restarts of the same host (same `userData`), so the
 * sweep still reclaims that host's prior-run scratch.
 */
export function defaultScratchBase(userDataPath: string): string {
  const tag = crypto
    .createHash("sha256")
    .update(path.resolve(userDataPath))
    .digest("hex")
    .slice(0, 16);
  return path.join(os.tmpdir(), `${SCRATCH_NAMESPACE}-${tag}`);
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
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(p);
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Create a scratch dir on demand (`mkdir -p`, owner-only). Idempotent. Takes the
 * already-derived dir (from {@link scratchRootFor}) so the path isn't computed
 * twice — the caller holds it for the agent binding anyway.
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
  if (secretsRoot) {
    const realScratch = await realpathNearest(scratchDir);
    const realSecrets = await realpathNearest(secretsRoot);
    if (containsPath(realSecrets, realScratch)) {
      throw new Error(
        `scratch root resolves inside the secret root (GRIDA-SEC-004): ${scratchDir}`
      );
    }
  }
  await mkdir(scratchDir, { recursive: true, mode: SCRATCH_DIR_MODE });
  // `mkdir`'s mode only applies to dirs it CREATES — a pre-existing (possibly
  // world-readable, attacker-pre-created) scratch or session dir keeps its mode.
  // Force owner-only on both, and FAIL CLOSED: a dir we can't restrict (e.g. one
  // we don't own → EPERM) must throw rather than silently serve artifacts to
  // other local accounts. The session dir is `path.dirname(scratchDir)`.
  await chmod(scratchDir, SCRATCH_DIR_MODE);
  await chmod(path.dirname(scratchDir), SCRATCH_DIR_MODE);
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
 */
export async function writeScratchFile(
  scratchDir: string,
  filename: string,
  bytes: Uint8Array
): Promise<string> {
  assertSafeFilename(filename);
  const full = path.join(scratchDir, filename);
  if (path.dirname(path.resolve(full)) !== path.resolve(scratchDir)) {
    throw new Error(`scratch filename escapes the scratch dir: ${filename}`);
  }
  await writeFile(full, bytes, { mode: SCRATCH_FILE_MODE });
  return full;
}

/**
 * Remove a session's scratch subtree (the whole `<base>/sessions/<id>`, so no
 * empty session dir lingers). Recursive and idempotent — removing a session that
 * never allocated scratch is a no-op. Used on session delete (S2: durability is
 * by promotion, so reclaiming scratch never loses value).
 */
export async function removeScratch(
  base: string,
  sessionId: string
): Promise<void> {
  assertSafeSessionId(sessionId);
  await rm(path.join(base, SESSIONS_DIRNAME, sessionId), {
    recursive: true,
    force: true,
  });
}

/**
 * Reclaim ALL session scratch dirs under `base` (`<base>/sessions/*`).
 * SYNCHRONOUS by design: the host calls it at start BEFORE it begins serving
 * runs, so a freshly resumed session's `ensureScratch` can't race a still-running
 * async sweep that would delete the dir underneath it. A single-instance daemon's
 * prior in-flight scratch is dead after a restart, so this bounds scratch's
 * lifetime even across a crash (S2). Best-effort — a missing base is a no-op; an
 * unreadable entry is skipped.
 */
export function sweepScratch(base: string): void {
  const sessionsDir = path.join(base, SESSIONS_DIRNAME);
  let entries: string[];
  try {
    entries = readdirSync(sessionsDir);
  } catch {
    // No base yet (fresh host) — nothing to reclaim.
    return;
  }
  for (const name of entries) {
    try {
      rmSync(path.join(sessionsDir, name), { recursive: true, force: true });
    } catch {
      // Skip an entry we can't remove; the next sweep retries.
    }
  }
}
