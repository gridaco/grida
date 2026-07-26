/**
 * SessionScheduler — the per-session **run-state machine** (RFC
 * `docs/wg/ai/agent/queue.md` + `session.md` §Session status).
 *
 * Owns the three things the CORE must own and the UI must not:
 *   1. the authoritative {@link SessionStatus} per session
 *      (idle/busy/waiting/error),
 *   2. a status-subscriber registry the SSE channel broadcasts from, and
 *   3. the SERIAL queue drain + a settle **cooldown** between turns.
 *
 * It **observes** the `StreamRegistry` lifecycle — {@link onCreate} (a turn
 * started → busy) and {@link onFinish} (a turn ended → waiting/idle/error,
 * then maybe drain) — so it learns of every run edge at the single chokepoints
 * without importing the runtime. The drain is an injected one-way dependency
 * ({@link SessionSchedulerDeps.drain}) the runtime supplies (it calls
 * `startTurn`); the scheduler never imports the runtime, and the registry
 * never imports the scheduler.
 *
 * Drain discipline (serial): on a CLEAN end edge (finish/abort, NOT error) the
 * machine first consults the persisted human-input state while retaining
 * `busy`. It then broadcasts either an explicit waiting state (and pauses) or
 * `idle`, waits {@link cooldown_ms}, selects the earliest queued head, and asks
 * the runtime to fire it. The runtime keeps that row QUEUED through all async
 * provider/workspace preparation while holding admission, then conditionally
 * claims it and reserves the stream on one synchronous stack. Retaining `busy`
 * during the persisted
 * human-input read is deliberate: publishing a transient `idle` frame would
 * tell the client that a normal submit is admissible while an approval or
 * question is still pending. A hard error or either waiting state PAUSES the
 * drain.
 *
 * Re-entrancy: `onFinish` runs inside the registry's `finish()`; the drain it
 * schedules runs on a fresh task (a timer), never inline inside `finish()`, so
 * a drained `startTurn` never reserves re-entrantly. Re-checks after each await
 * abandon if a new turn started; the single-flight reserve in `drain` is the
 * ultimate guard.
 *
 * GRIDA-SEC-004 — this state machine is part of the supervised human-input
 * boundary: persisted approvals/questions pause queue drain, including after a
 * host restart, until the exact interaction is resolved.
 */

import type { StreamEndReason } from "./stream-registry";
import type { SessionStatus } from "../protocol/session-status";

export type SessionSchedulerDeps = {
  /** Read the pending queue (FIFO) for a session. */
  list_queued: (sessionId: string) => Promise<ReadonlyArray<{ id: string }>>;
  /**
   * Prepare and fire ONE queued turn. The row MUST remain queued during every
   * await. The runtime holds admission throughout preparation, then
   * conditionally claims this exact `(sessionId, messageId)` row and starts the
   * registry synchronously. Returns true only when that busy edge landed.
   * False means cancel, another claimant, or a late human block won; the
   * scheduler reclassifies persisted state before deciding whether to retry.
   * A preparation failure throws and pauses auto-drain with the row preserved
   * for a later explicit edge.
   */
  drain: (sessionId: string, messageId: string) => Promise<boolean>;
  /**
   * Classify whether the current turn is BLOCKED awaiting a user decision:
   * an unanswered supervised approval, or a human-input tool (e.g.
   * `question`) paused for the user's answer. Consulted against the
   * AUTHORITATIVE persisted state both when a turn settles and at the drain
   * fire-gate, so the projection survives host restarts and cannot fire a
   * queued turn ahead of the pending decision.
   */
  pending_human_input_kind: (
    sessionId: string
  ) => Promise<"approval" | "user-input" | null>;
  /** Inter-turn settle delay before a drained turn fires (ms). */
  drain_cooldown_ms?: number;
};

/** Default inter-drain cooldown. The visible Stop→Send→Stop window + the idle
 *  gap in which the client hydrates the just-fired user message. */
export const DEFAULT_DRAIN_COOLDOWN_MS = 1000;

type StatusListener = (status: SessionStatus) => void;

export class SessionScheduler {
  private readonly statuses = new Map<string, SessionStatus>();
  private readonly listeners = new Map<string, Set<StatusListener>>();
  /** Sessions whose StreamRegistry entry is currently running. */
  private readonly active_sessions = new Set<string>();
  private readonly drain_timers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  /** Async fire-gates already preparing one queued head for this session. */
  private readonly draining_sessions = new Set<string>();
  /**
   * One coalesced trusted drain edge received while a fire-gate is in flight.
   * If that attempt fails before claiming, its `finally` schedules one fresh
   * pass so the concurrent enqueue/refresh is not forgotten.
   */
  private readonly pending_drain_kicks = new Set<string>();
  /**
   * Per-session lifecycle revision. Async persisted-state reads only publish
   * when the revision they started under is still current, so a late settle or
   * hydration read cannot overwrite a newer `onCreate` edge.
   */
  private readonly revisions = new Map<string, number>();
  private readonly cooldown_ms: number;
  private disposed = false;

  constructor(private readonly deps: SessionSchedulerDeps) {
    this.cooldown_ms = deps.drain_cooldown_ms ?? DEFAULT_DRAIN_COOLDOWN_MS;
  }

  // ───────────────── status reads + subscription ─────────────────
  // The status SSE hydrates persisted human-input state before subscribing.
  // Direct in-memory reads still default to idle when no lifecycle is known.

  getStatus(sessionId: string): SessionStatus {
    return this.statuses.get(sessionId) ?? { state: "idle" };
  }

  /**
   * Resolve a cold session's first status from durable human-input state.
   * Called before the status SSE subscribes, so a host restart cannot emit an
   * incorrect initial `idle` frame for a persisted approval/question block.
   *
   * A lifecycle transition that races this read wins: the revision check
   * returns the newer in-memory status instead of overwriting it.
   */
  async hydrateStatus(sessionId: string): Promise<SessionStatus> {
    const known = this.statuses.get(sessionId);
    if (known) return known;
    const revision = this.revision(sessionId);
    const status = await this.readSettledStatus(sessionId);
    if (this.disposed) return this.getStatus(sessionId);
    if (this.revision(sessionId) !== revision || this.statuses.has(sessionId)) {
      return this.getStatus(sessionId);
    }
    this.setStatus(sessionId, status);
    // GRIDA-SEC-004 — hydration is reached from the read-only status SSE.
    // It may classify and project durable state, but MUST NOT schedule work:
    // possession of a leaked query token cannot become run/billing/filesystem
    // authority. Trusted lifecycle and mutation paths kick the drain.
    return status;
  }

  /**
   * Re-read a non-running session after an out-of-band transcript mutation
   * such as rewind/un-rewind. Waiting status is derived from visible persisted
   * parts, so hiding or restoring a block must update the projection too.
   */
  async refreshStatus(sessionId: string): Promise<SessionStatus> {
    const current = this.getStatus(sessionId);
    if (this.active_sessions.has(sessionId)) {
      return current;
    }
    this.clearDrainTimer(sessionId);
    const revision = this.bumpRevision(sessionId);
    const status = await this.readSettledStatus(sessionId);
    if (this.disposed || this.revision(sessionId) !== revision) {
      return this.getStatus(sessionId);
    }
    this.setStatus(sessionId, status);
    if (status.state === "idle") this.scheduleDrain(sessionId);
    return status;
  }

  /**
   * Subscribe to a session's status. The CURRENT status is delivered
   * immediately (so a late joiner's first frame is the live state), then every
   * subsequent change. Returns an unsubscribe fn.
   */
  subscribe(sessionId: string, listener: StatusListener): () => void {
    let set = this.listeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.listeners.set(sessionId, set);
    }
    set.add(listener);
    // Deliver current immediately — never let a throwing listener break attach.
    try {
      listener(this.getStatus(sessionId));
    } catch {
      /* ignore */
    }
    return () => {
      const s = this.listeners.get(sessionId);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) this.listeners.delete(sessionId);
    };
  }

  // ───────────────── StreamRegistry lifecycle observer ─────────────────

  /**
   * A turn started (registry `create`) → busy. `firedMessageId` identifies the
   * new user row for direct/queued turns; continuations intentionally omit it.
   */
  onCreate(sessionId: string, firedMessageId?: string): void {
    // A turn is starting: any pending drain timer is moot — this turn
    // re-triggers a drain check when it finishes.
    this.clearDrainTimer(sessionId);
    this.active_sessions.add(sessionId);
    this.bumpRevision(sessionId);
    this.setStatus(sessionId, {
      state: "busy",
      started_at: Date.now(),
      ...(firedMessageId ? { message_id: firedMessageId } : {}),
    });
  }

  /**
   * A message was just enqueued. If the session is already **idle** with no
   * drain pending, kick one — otherwise this row would never fire (a client
   * enqueues believing it is busy, but the turn may have just ended). A no-op
   * while busy (the turn-end edge drains) or while a drain is already scheduled
   * (it will pick up the new row). If async drain preparation is already in
   * flight, remember one follow-up kick: a preparation failure must not swallow
   * the only edge that can make the newly queued row run.
   */
  notifyEnqueued(sessionId: string): void {
    if (this.getStatus(sessionId).state !== "idle") return;
    this.scheduleDrain(sessionId);
  }

  /**
   * A turn ended (registry `finish`) → waiting/idle/error, then maybe drain.
   * A clean end retains `busy` while persisted state is consulted; this avoids
   * an observable idle admission race before a pending block is classified.
   */
  onFinish(sessionId: string, reason: StreamEndReason): void {
    this.active_sessions.delete(sessionId);
    if (reason === "error") {
      // Hard failure PAUSES the drain (RFC `queue`): queued rows wait for the
      // next fired turn. Do NOT schedule a drain.
      this.bumpRevision(sessionId);
      this.setStatus(sessionId, { state: "error" });
      return;
    }
    const revision = this.bumpRevision(sessionId);
    void this.publishSettledStatus(sessionId, revision);
  }

  // ───────────────── drain (cooldown → select + atomic runtime fire) ────────

  /**
   * Wait the cooldown, select the earliest queued head, and ask the runtime to
   * fire it. Selection is read-only: the row keeps `queued_at` during provider
   * and workspace preparation while runtime admission serializes session
   * mutation. Runtime claim + stream reservation is the atomic fire boundary.
   * An empty queue at fire is a no-op.
   */
  private scheduleDrain(sessionId: string): void {
    if (this.disposed || this.drain_timers.has(sessionId)) return;
    if (this.draining_sessions.has(sessionId)) {
      this.pending_drain_kicks.add(sessionId);
      return;
    }
    this.setDrainTimer(sessionId, this.cooldown_ms, async () => {
      if (
        this.getStatus(sessionId).state !== "idle" ||
        this.draining_sessions.has(sessionId)
      ) {
        return;
      }
      this.draining_sessions.add(sessionId);
      let retry = false;
      try {
        // Re-check authoritative persisted state at FIRE time. A block can land
        // after the clean-end classification (or this timer can have been
        // kicked from a cold/default-idle enqueue). Fail closed.
        const pending = await this.deps.pending_human_input_kind(sessionId);
        if (this.getStatus(sessionId).state !== "idle") return;
        if (pending) {
          this.bumpRevision(sessionId);
          this.setStatus(sessionId, waitingStatus(pending));
          return;
        }
        const items = await this.deps.list_queued(sessionId);
        if (this.getStatus(sessionId).state !== "idle") return;
        const head = items[0];
        if (!head) return;
        const fired = await this.deps.drain(sessionId, head.id);
        if (!fired) {
          if (this.getStatus(sessionId).state !== "idle") return;
          // `drain` performs the decisive persisted-state check under
          // admission. A false result can therefore mean a human block landed
          // after the timer's earlier check. Reclassify instead of spinning a
          // retry loop against a row that must remain paused.
          const pendingAfterDrain =
            await this.deps.pending_human_input_kind(sessionId);
          if (this.getStatus(sessionId).state !== "idle") return;
          if (pendingAfterDrain) {
            this.bumpRevision(sessionId);
            this.setStatus(sessionId, waitingStatus(pendingAfterDrain));
            return;
          }
          retry = true;
        }
      } catch {
        // Persisted-state/provider/workspace failure: the row was not claimed,
        // so leave it queued. Ordinarily this pauses until a later trusted idle
        // edge; an edge already received during this attempt is replayed below.
      } finally {
        this.draining_sessions.delete(sessionId);
        const kicked = this.pending_drain_kicks.delete(sessionId);
        // A false claim is a benign cancel/admission race. If no winner made
        // the session busy, select the current head again after a cooldown.
        // Likewise, replay exactly one coalesced enqueue/refresh kick that
        // arrived during async preparation, including when preparation threw.
        if ((retry || kicked) && this.getStatus(sessionId).state === "idle") {
          this.scheduleDrain(sessionId);
        }
      }
    });
  }

  private setDrainTimer(
    sessionId: string,
    ms: number,
    fn: () => void | Promise<void>
  ): void {
    this.clearDrainTimer(sessionId);
    const handle = setTimeout(() => {
      // The timer fired — drop the (now-stale) handle before running, so a
      // re-entrant onCreate (from the drain's own startTurn) clears nothing.
      this.drain_timers.delete(sessionId);
      void fn();
    }, ms);
    this.drain_timers.set(sessionId, handle);
  }

  private clearDrainTimer(sessionId: string): void {
    const handle = this.drain_timers.get(sessionId);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.drain_timers.delete(sessionId);
    }
  }

  private async publishSettledStatus(
    sessionId: string,
    revision: number
  ): Promise<void> {
    const status = await this.readSettledStatus(sessionId);
    if (this.disposed || this.revision(sessionId) !== revision) return;
    this.setStatus(sessionId, status);
    if (status.state === "idle") this.scheduleDrain(sessionId);
  }

  private async readSettledStatus(sessionId: string): Promise<SessionStatus> {
    try {
      const pending = await this.deps.pending_human_input_kind(sessionId);
      return pending ? waitingStatus(pending) : { state: "idle" };
    } catch (err) {
      // The classification is an admission boundary. Fail closed rather than
      // publishing idle when persisted state could not be confirmed.
      return {
        state: "error",
        message: `failed to resolve pending human input: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  private revision(sessionId: string): number {
    return this.revisions.get(sessionId) ?? 0;
  }

  private bumpRevision(sessionId: string): number {
    const next = this.revision(sessionId) + 1;
    this.revisions.set(sessionId, next);
    return next;
  }

  private setStatus(sessionId: string, status: SessionStatus): void {
    this.statuses.set(sessionId, status);
    const set = this.listeners.get(sessionId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(status);
      } catch {
        /* never let one listener break the broadcast */
      }
    }
  }

  // ───────────────── lifecycle ─────────────────

  /** Drop a session's run-state (call when a session is deleted). */
  forget(sessionId: string): void {
    this.clearDrainTimer(sessionId);
    this.active_sessions.delete(sessionId);
    this.draining_sessions.delete(sessionId);
    this.pending_drain_kicks.delete(sessionId);
    // Invalidate any outstanding settle/hydration read before dropping state.
    this.bumpRevision(sessionId);
    this.statuses.delete(sessionId);
  }

  /** Clear all timers + state (host shutdown). Listeners detach themselves. */
  dispose(): void {
    this.disposed = true;
    for (const handle of this.drain_timers.values()) clearTimeout(handle);
    this.drain_timers.clear();
    this.active_sessions.clear();
    this.draining_sessions.clear();
    this.pending_drain_kicks.clear();
    this.statuses.clear();
    this.revisions.clear();
    this.listeners.clear();
  }
}

function waitingStatus(kind: "approval" | "user-input"): SessionStatus {
  return {
    state:
      kind === "approval" ? "waiting_on_approval" : "waiting_on_user_input",
  };
}
