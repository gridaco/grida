/**
 * SessionScheduler — the per-session **run-state machine** (RFC
 * `docs/wg/ai/agent/queue.md` + `session.md` §Session status).
 *
 * Owns the three things the CORE must own and the UI must not:
 *   1. the authoritative {@link SessionStatus} per session (idle/busy/error),
 *   2. a status-subscriber registry the SSE channel broadcasts from, and
 *   3. the SERIAL queue drain + a settle **cooldown** between turns.
 *
 * It **observes** the `StreamRegistry` lifecycle — {@link onCreate} (a turn
 * started → busy) and {@link onFinish} (a turn ended → idle/error, then maybe
 * drain) — so it learns of every busy/idle edge at the single chokepoints
 * without importing the runtime. The drain is an injected one-way dependency
 * ({@link SessionSchedulerDeps.drain}) the runtime supplies (it calls
 * `startTurn`); the scheduler never imports the runtime, and the registry
 * never imports the scheduler.
 *
 * Drain discipline (serial): on a CLEAN idle edge (finish/abort, NOT error)
 * the machine broadcasts `idle` immediately, then waits {@link cooldown_ms}
 * and, at FIRE time, dequeues the earliest queued head (clears its
 * `queued_at`) and starts its turn. The row stays QUEUED for the whole
 * cooldown — visible in `list_queued`, so a UI keeps showing it as pending and
 * it "submits" (becomes a real turn) only when it fires, in step with the
 * response. The session is genuinely idle through the cooldown, so the
 * Stop/Send control reads Send and the UI paints Stop→Send→Stop. A hard error
 * PAUSES the drain (queued rows wait for the next fired turn). A turn BLOCKED
 * awaiting a user decision (a pending supervised approval) pauses it the same
 * way: an approval-request finishes the run cleanly so the session reads idle,
 * but it is not a completed turn — the fire-gate consults
 * {@link SessionSchedulerDeps.has_pending_approval} and holds the queue until
 * the user answers and the turn continues to a true finish.
 *
 * Re-entrancy: `onFinish` runs inside the registry's `finish()`; the drain it
 * schedules runs on a fresh task (a timer), never inline inside `finish()`, so
 * a drained `startTurn` never reserves re-entrantly. Re-checks after each await
 * abandon if a new turn started; the single-flight reserve in `drain` is the
 * ultimate guard.
 */

import type { StreamEndReason } from "./stream-registry";
import type { SessionStatus } from "../protocol/session-status";

export type SessionSchedulerDeps = {
  /** Read the pending queue (FIFO) for a session. */
  list_queued: (sessionId: string) => Promise<ReadonlyArray<{ id: string }>>;
  /** Clear a row's `queued_at` so it becomes a visible user message. */
  dequeue: (messageId: string) => Promise<void>;
  /**
   * Fire ONE turn for a session (the runtime's `startTurn`). MUST start the
   * registry reserve synchronously (so `onCreate` lands before this resolves).
   * Throws if a run is already in flight (single-flight) — the scheduler
   * swallows that and waits for the next idle edge. The selected row is
   * already dequeued (visible), so the turn's model view includes it as the
   * latest user message; `messageId` names that fired row — the
   * fired-message identity the turn-lifecycle wire must carry (RFC
   * `turn-authority`), threaded so the core can EMIT it rather than discard
   * it. It does not select what runs (the dequeue already did).
   */
  drain: (sessionId: string, messageId: string) => Promise<void>;
  /**
   * Is this session's current turn BLOCKED awaiting a user decision (an
   * unanswered supervised approval)? A blocked turn is NOT a completed turn:
   * the drain stays paused until the user resolves it — like a hard error
   * pauses it (RFC `queue` § drain-pause). Consulted at the drain fire-gate
   * against the AUTHORITATIVE persisted approval state (restart-durable, unlike
   * an in-memory flag). Required so a scheduler cannot silently forget the
   * block and fire a queued turn before the user answers.
   */
  has_pending_approval: (sessionId: string) => Promise<boolean>;
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
  private readonly drain_timers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly cooldown_ms: number;

  constructor(private readonly deps: SessionSchedulerDeps) {
    this.cooldown_ms = deps.drain_cooldown_ms ?? DEFAULT_DRAIN_COOLDOWN_MS;
  }

  // ───────────────── status reads + subscription ─────────────────
  // The Phase-3 status SSE consumes these; a session not in the map reads as
  // idle (the volatile default — also every session after a host restart).

  getStatus(sessionId: string): SessionStatus {
    return this.statuses.get(sessionId) ?? { state: "idle" };
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

  /** A turn started (registry `create`) → busy. */
  onCreate(sessionId: string): void {
    // A turn is starting: any pending drain timer is moot — this turn
    // re-triggers a drain check when it finishes.
    this.clearDrainTimer(sessionId);
    this.setStatus(sessionId, { state: "busy", started_at: Date.now() });
  }

  /**
   * A message was just enqueued. If the session is already **idle** with no
   * drain pending, kick one — otherwise this row would never fire (a client
   * enqueues believing it is busy, but the turn may have just ended). A no-op
   * while busy (the turn-end edge drains) or while a drain is already scheduled
   * (it will pick up the new row).
   */
  notifyEnqueued(sessionId: string): void {
    if (this.getStatus(sessionId).state !== "idle") return;
    if (this.drain_timers.has(sessionId)) return;
    this.scheduleDrain(sessionId);
  }

  /** A turn ended (registry `finish`) → idle/error, then maybe drain. */
  onFinish(sessionId: string, reason: StreamEndReason): void {
    if (reason === "error") {
      // Hard failure PAUSES the drain (RFC `queue`): queued rows wait for the
      // next fired turn. Do NOT schedule a drain.
      this.setStatus(sessionId, { state: "error" });
      return;
    }
    // Clean settle (finish/abort) → idle NOW (the button flips to Send), then
    // wait the cooldown and fire the next queued head.
    this.setStatus(sessionId, { state: "idle" });
    this.scheduleDrain(sessionId);
  }

  // ───────────────── drain (cooldown → dequeue + fire) ─────────────────

  /**
   * Wait the cooldown, then DEQUEUE the earliest queued head and fire it. The
   * row stays queued (`queued_at` set, visible in `list_queued`) for the whole
   * cooldown — so a UI keeps showing it as pending and it "submits" (becomes a
   * real turn) only when it fires, matching the response delay. The session is
   * genuinely idle throughout, so the Stop/Send control reads Send during the
   * gap. Re-checks after each await abandon if a new turn started; the single-
   * flight reserve in `drain` is the ultimate guard (a lost race throws and is
   * swallowed). An empty queue at fire is a no-op (a normal turn-end).
   */
  private scheduleDrain(sessionId: string): void {
    this.setDrainTimer(sessionId, this.cooldown_ms, async () => {
      if (this.getStatus(sessionId).state !== "idle") return;
      // A turn BLOCKED awaiting a user decision (an unanswered supervised
      // approval) is not ready for the next turn: pause the drain until the
      // user resolves it (RFC `queue` § drain-pause — the same class as a hard
      // error pausing the drain). The session reads `idle` through the pause —
      // an approval-request finishes the run cleanly — so idle alone is NOT a
      // sufficient drainability predicate. Checked against the authoritative
      // persisted approval state. Fail closed: never drain over an unconfirmed
      // block.
      try {
        if (await this.deps.has_pending_approval(sessionId)) return;
      } catch {
        return;
      }
      if (this.getStatus(sessionId).state !== "idle") return;
      let items: ReadonlyArray<{ id: string }>;
      try {
        items = await this.deps.list_queued(sessionId);
      } catch {
        return;
      }
      if (this.getStatus(sessionId).state !== "idle") return;
      const head = items[0];
      if (!head) return; // empty queue → stay idle (a plain turn-end)
      try {
        await this.deps.dequeue(head.id); // becomes a visible user message NOW
      } catch {
        return;
      }
      if (this.getStatus(sessionId).state !== "idle") return;
      try {
        await this.deps.drain(sessionId, head.id);
      } catch {
        // RunInFlightError (lost a single-flight race) or a provider-down at
        // drain time: the next clean idle edge re-checks the queue. We do NOT
        // surface this as `error` — the run that won the race owns the status.
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
    this.statuses.delete(sessionId);
  }

  /** Clear all timers + state (host shutdown). Listeners detach themselves. */
  dispose(): void {
    for (const handle of this.drain_timers.values()) clearTimeout(handle);
    this.drain_timers.clear();
    this.statuses.clear();
    this.listeners.clear();
  }
}
