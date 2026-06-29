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

import { mkdir, rm } from "node:fs/promises";
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
 * Create a scratch dir on demand (`mkdir -p`, owner-only). Idempotent. Takes the
 * already-derived dir (from {@link scratchRootFor}) so the path isn't computed
 * twice — the caller holds it for the agent binding anyway.
 *
 * `secretsRoot`, when given, is asserted against before any I/O — a base that
 * would nest scratch in the secret root fails loudly rather than silently
 * creating an unreachable dir.
 */
export async function ensureScratch(
  scratchDir: string,
  secretsRoot?: string
): Promise<void> {
  assertOutsideSecretsRoot(scratchDir, secretsRoot);
  await mkdir(scratchDir, { recursive: true, mode: SCRATCH_DIR_MODE });
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
