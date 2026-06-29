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

import { mkdir, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Where every session's scratch dir lives under a `base`. */
const SESSIONS_DIRNAME = "sessions";
const SCRATCH_DIRNAME = "scratch";
const SCRATCH_NAMESPACE = "grida-agent";

/**
 * Default base directory for session scratch areas when the host injects none.
 * `<os.tmpdir()>/grida-agent`. Resolved at the host/server boundary (the thin
 * adapter shell), so the runtime core never names a temp path itself — a future
 * host with a different filesystem reality (a cloud sandbox) injects its own.
 */
export function defaultScratchBase(): string {
  return path.join(os.tmpdir(), SCRATCH_NAMESPACE);
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

/** The per-session parent of `scratch` (`<base>/sessions/<id>`) — what cleanup
 *  removes so no empty session dir is left behind. */
function sessionDirFor(base: string, sessionId: string): string {
  assertSafeSessionId(sessionId);
  return path.join(base, SESSIONS_DIRNAME, sessionId);
}

/**
 * Assert a scratch root is NOT inside the host's secret root (S4 containment).
 * PURE. Uses the same `path.sep`-terminated prefix discipline as the shell
 * runner's `containsPath`, so a sibling like `${secretsRoot}-x` never counts as
 * inside. Throws when the invariant is violated — a misconfigured base that
 * nests scratch in `userData` is a programming error, not a runtime condition.
 */
export function assertOutsideSecretsRoot(
  scratchRoot: string,
  secretsRoot: string | undefined
): void {
  if (!secretsRoot) return;
  const root = path.resolve(secretsRoot);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  const candidate = path.resolve(scratchRoot);
  if (candidate === root || candidate.startsWith(prefix)) {
    throw new Error(
      `scratch root must not be inside the secret root (GRIDA-SEC-004): ${scratchRoot}`
    );
  }
}

/**
 * Create a session's scratch dir on demand (`mkdir -p`). Idempotent. Returns the
 * resolved scratch root so the caller can hand it to the agent.
 *
 * `secretsRoot`, when given, is asserted against before any I/O — a base that
 * would nest scratch in the secret root fails loudly rather than silently
 * creating an unreachable dir.
 */
export async function ensureScratch(
  base: string,
  sessionId: string,
  secretsRoot?: string
): Promise<string> {
  const root = scratchRootFor(base, sessionId);
  assertOutsideSecretsRoot(root, secretsRoot);
  await mkdir(root, { recursive: true });
  return root;
}

/**
 * Remove a session's scratch subtree (the whole `<base>/sessions/<id>`).
 * Recursive and idempotent — removing a session that never allocated scratch is
 * a no-op. Used on session delete (S2: durability is by promotion, so reclaiming
 * scratch never loses value).
 */
export async function removeScratch(
  base: string,
  sessionId: string
): Promise<void> {
  await rm(sessionDirFor(base, sessionId), { recursive: true, force: true });
}

/**
 * Reclaim ALL session scratch dirs under `base` (`<base>/sessions/*`). Called
 * once at host start: a single-instance daemon's prior in-flight scratch is dead
 * after a restart, so sweeping bounds scratch's lifetime even across a crash
 * (S2). Best-effort — a missing base is a no-op; an unreadable entry is skipped.
 */
export async function sweepScratch(base: string): Promise<void> {
  const sessionsDir = path.join(base, SESSIONS_DIRNAME);
  let entries: string[];
  try {
    entries = await readdir(sessionsDir);
  } catch {
    // No base yet (fresh host) — nothing to reclaim.
    return;
  }
  await Promise.all(
    entries.map((name) =>
      rm(path.join(sessionsDir, name), { recursive: true, force: true }).catch(
        () => undefined
      )
    )
  );
}
