/**
 * GRIDA-SEC-004 — session-scoped, read-only directory grants.
 *
 * A trusted host gesture supplies a raw directory path once. This registry
 * canonicalizes it, rejects the daemon's secret tree, and returns an opaque
 * descriptor whose virtual path is safe to persist and show to the model. The
 * real root never crosses the transport response. A later run claims the
 * pending descriptor for exactly one session; replaying the persisted message
 * part cannot recreate the consumed authority, and a fork owns no grants unless
 * the user performs a new gesture there.
 *
 * The registry is deliberately in-memory. Pending grants are short-lived and
 * bounded; claimed grants live for the session or process lifetime. This is the
 * host-held authority behind compositor `directory-ref`, not durable chat IR.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { containsPath } from "@grida/daemon/server";
import {
  DIRECTORY_SCOPE_MOUNT_ROOT,
  type DirectoryScopeDescriptor,
} from "../protocol/context";

const DEFAULT_PENDING_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_MAX_PENDING = 64;

export type DirectoryScopeGrant = DirectoryScopeDescriptor & {
  /** Canonical host path. Server-internal; never serialize this object. */
  root: string;
};

export type DirectoryScopeErrorCode =
  | "directory-scope-invalid-path"
  | "directory-scope-not-directory"
  | "directory-scope-protected-root"
  | "directory-scope-pending-limit"
  | "directory-scope-unavailable"
  | "directory-scope-descriptor-mismatch"
  | "directory-scope-owned-by-another-session";

export class DirectoryScopeError extends Error {
  constructor(
    public readonly code: DirectoryScopeErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DirectoryScopeError";
  }
}

type PendingScope = DirectoryScopeGrant & {
  expires_at: number;
};

type ClaimedScope = DirectoryScopeGrant & {
  session_id: string;
};

export type DirectoryScopeRegistryOptions = {
  /** Daemon `userData`: BYOK/session state that references must never expose. */
  secrets_root?: string;
  /** Host sensitive-read roots (HOME credentials/rc state from sandbox policy). */
  protected_roots?: readonly string[];
  pending_ttl_ms?: number;
  max_pending?: number;
  /** Deterministic clock for contract tests. */
  now?: () => number;
};

export class DirectoryScopeRegistry {
  private readonly pending = new Map<string, PendingScope>();
  private readonly claimed = new Map<string, ClaimedScope>();
  private readonly sessions = new Map<string, Set<string>>();
  private pending_reservations = 0;
  private readonly protected_roots: readonly string[];
  private readonly pending_ttl_ms: number;
  private readonly max_pending: number;
  private readonly now: () => number;

  constructor(opts: DirectoryScopeRegistryOptions = {}) {
    this.protected_roots = [
      ...(opts.secrets_root ? [opts.secrets_root] : []),
      ...(opts.protected_roots ?? []),
    ];
    this.pending_ttl_ms = positiveInteger(
      opts.pending_ttl_ms,
      DEFAULT_PENDING_TTL_MS
    );
    this.max_pending = positiveInteger(opts.max_pending, DEFAULT_MAX_PENDING);
    this.now = opts.now ?? Date.now;
  }

  /**
   * Mint a one-shot descriptor for an exact host directory. The path is
   * realpath'd before its identity is recorded: no parent/repository expansion,
   * and a symlinked selection names its actual target. The raw path is accepted
   * only at this host boundary; callers persist the returned descriptor.
   */
  async attach(rawPath: string): Promise<DirectoryScopeDescriptor> {
    this.pruneExpired();
    if (this.pending.size + this.pending_reservations >= this.max_pending) {
      throw new DirectoryScopeError(
        "directory-scope-pending-limit",
        "too many unclaimed directory references"
      );
    }
    // Reserve synchronously, before any filesystem await, so concurrent
    // gestures cannot all pass the bound before one commits to `pending`.
    this.pending_reservations += 1;

    try {
      let root: string;
      try {
        root = await fs.realpath(rawPath);
      } catch {
        throw new DirectoryScopeError(
          "directory-scope-invalid-path",
          "directory path could not be resolved"
        );
      }

      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(root);
      } catch {
        throw new DirectoryScopeError(
          "directory-scope-invalid-path",
          "directory path could not be inspected"
        );
      }
      if (!stat.isDirectory()) {
        throw new DirectoryScopeError(
          "directory-scope-not-directory",
          "selected path is not a directory"
        );
      }

      for (const protectedPath of this.protected_roots) {
        // Deliberately resolve on every attachment gesture. A protected path
        // may be created or retargeted as a symlink while this registry lives;
        // caching its first identity would make the deny stale.
        const protectedRoot = await fs
          .realpath(protectedPath)
          .catch(() => path.resolve(protectedPath));
        // Reject BOTH directions. Selecting a protected root (or a child) is an
        // obvious secret read; selecting an ancestor would expose the same tree
        // through descendant traversal. This in-process check keeps the deny true
        // even where the outer OS sandbox is unavailable.
        if (
          containsPath(protectedRoot, root) ||
          containsPath(root, protectedRoot)
        ) {
          throw new DirectoryScopeError(
            "directory-scope-protected-root",
            "selected directory overlaps a protected host directory"
          );
        }
      }

      const id = `dir_${crypto.randomUUID()}`;
      const descriptor: DirectoryScopeDescriptor = {
        kind: "scope",
        id,
        name: path.basename(root) || root,
        path: `${DIRECTORY_SCOPE_MOUNT_ROOT}/${id}`,
        access: "read",
      };
      this.pending.set(id, {
        ...descriptor,
        root,
        expires_at: this.now() + this.pending_ttl_ms,
      });
      return { ...descriptor };
    } finally {
      this.pending_reservations -= 1;
    }
  }

  /**
   * Atomically claim every id for `sessionId`. Validation completes for the
   * whole set before a pending entry is consumed, so one stale/foreign id
   * leaves every valid sibling pending. Reclaim by the SAME session is
   * idempotent; another session can never adopt the id.
   */
  claim(
    sessionId: string,
    descriptors: readonly DirectoryScopeDescriptor[]
  ): DirectoryScopeGrant[] {
    this.pruneExpired();
    const unique = new Map<string, DirectoryScopeDescriptor>();
    for (const descriptor of descriptors) {
      if (unique.has(descriptor.id)) {
        throw new DirectoryScopeError(
          "directory-scope-descriptor-mismatch",
          "directory reference is duplicated"
        );
      }
      unique.set(descriptor.id, descriptor);
    }
    const expected = [...unique.values()];
    const resolved: Array<PendingScope | ClaimedScope> = [];

    for (const descriptor of expected) {
      const id = descriptor.id;
      const owned = this.claimed.get(id);
      if (owned) {
        if (owned.session_id !== sessionId) {
          throw new DirectoryScopeError(
            "directory-scope-owned-by-another-session",
            "directory reference belongs to another session"
          );
        }
        this.assertDescriptor(descriptor, owned);
        resolved.push(owned);
        continue;
      }
      const candidate = this.pending.get(id);
      if (!candidate) {
        throw new DirectoryScopeError(
          "directory-scope-unavailable",
          "directory reference is unavailable or expired"
        );
      }
      this.assertDescriptor(descriptor, candidate);
      resolved.push(candidate);
    }

    // Commit only after every id passed. This loop cannot fail.
    for (let i = 0; i < expected.length; i += 1) {
      const id = expected[i].id;
      const scope = resolved[i];
      if ("session_id" in scope) continue;
      this.pending.delete(id);
      const claimed: ClaimedScope = {
        kind: scope.kind,
        id: scope.id,
        name: scope.name,
        path: scope.path,
        access: scope.access,
        root: scope.root,
        session_id: sessionId,
      };
      this.claimed.set(id, claimed);
      let session = this.sessions.get(sessionId);
      if (!session) {
        session = new Set();
        this.sessions.set(sessionId, session);
      }
      session.add(id);
    }

    return expected.map(({ id }) => toGrant(this.claimed.get(id)!));
  }

  /** Snapshot of this session's live grants. Roots remain server-internal. */
  forSession(sessionId: string): DirectoryScopeGrant[] {
    const ids = this.sessions.get(sessionId);
    if (!ids) return [];
    const out: DirectoryScopeGrant[] = [];
    for (const id of ids) {
      const scope = this.claimed.get(id);
      if (scope) out.push(toGrant(scope));
    }
    return out;
  }

  /** Revoke every grant owned by a deleted session. Pending scopes are intact. */
  forgetSession(sessionId: string): void {
    const ids = this.sessions.get(sessionId);
    if (!ids) return;
    for (const id of ids) this.claimed.delete(id);
    this.sessions.delete(sessionId);
  }

  /** Host teardown: no in-memory capability survives the process lifecycle. */
  dispose(): void {
    this.pending.clear();
    this.claimed.clear();
    this.sessions.clear();
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [id, scope] of this.pending) {
      if (scope.expires_at <= now) this.pending.delete(id);
    }
  }

  private assertDescriptor(
    expected: DirectoryScopeDescriptor,
    actual: DirectoryScopeDescriptor
  ): void {
    if (
      expected.kind !== actual.kind ||
      expected.id !== actual.id ||
      expected.name !== actual.name ||
      expected.path !== actual.path ||
      expected.access !== actual.access
    ) {
      throw new DirectoryScopeError(
        "directory-scope-descriptor-mismatch",
        "directory reference descriptor does not match its host grant"
      );
    }
  }
}

function toGrant(scope: ClaimedScope): DirectoryScopeGrant {
  return {
    kind: scope.kind,
    id: scope.id,
    name: scope.name,
    path: scope.path,
    access: scope.access,
    root: scope.root,
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}
