/**
 * GRIDA-SEC-004 — in-flight agent stream registry.
 *
 * Owns one task only: decouple upstream model lifetime from HTTP
 * consumers. A disconnect detaches one consumer; explicit abort cancels
 * the model call.
 */

export type StreamEndReason = "finish" | "abort" | "error";

export type StreamConsumer = {
  on_frame: (data: string) => void | Promise<void>;
  on_end: (reason: StreamEndReason) => void | Promise<void>;
  on_error?: (err: unknown) => void;
};

export type StreamEntry = {
  readonly session_id: string;
  /** User message fired by this turn; absent for approval/question resumes. */
  readonly fired_message_id?: string;
  readonly model_abort: AbortController;
  status: "running" | "ended";
  end_reason?: StreamEndReason;
  chunks: string[];
  consumers: Map<string, StreamConsumer>;
  gc_timer?: ReturnType<typeof setTimeout>;
  /**
   * Self-contained continuation replay (see `replay-prefix.ts`): frames
   * that reconstruct the CONTINUED assistant message's persisted parts,
   * served to opt-in (reconnect) consumers BEFORE the buffered replay.
   * Never enters `chunks[]` — the run-response consumer and the recorder
   * must not see it (duplication / double-persist). A promise because the
   * snapshot is an async store read kicked at reserve time; it must never
   * reject (the builder degrades to `[]`).
   */
  replay_prefix?: Promise<readonly string[]>;
};

/**
 * A short-lived, synchronous admission lease for one session. The runtime
 * acquires it before an async direct-run persistence phase, or immediately
 * before a queued row is claimed. {@link StreamRegistry.create} consumes the
 * exact object by identity when it installs the running entry.
 */
export type StreamAdmission = Readonly<{
  session_id: string;
}>;

export class RunInFlightError extends Error {
  readonly code = "run_in_flight" as const;
  constructor(public readonly sessionId: string) {
    super(`agent run already in flight for sessionId=${sessionId}`);
    this.name = "RunInFlightError";
  }
}

export type StreamRegistryOptions = {
  /** Grace period after end before the entry is GC'd. Default 60s. */
  finish_grace_ms?: number;
};

type StreamSettlement = {
  readonly entry: StreamEntry;
  readonly promise: Promise<void>;
};

/**
 * Lifecycle observer — the two clean edges the registry's lifecycle exposes:
 * a turn started (`create`) and a turn ended (`finish`, including the abort
 * path which funnels through `finish`). Attachable post-construction so it
 * works for an injected registry too. The seam is MULTI-subscriber (RFC
 * `events` §semantics): the run-state machine ({@link SessionScheduler}) and
 * the lifecycle event bus both observe it, and attaching one never displaces
 * another.
 */
export type StreamLifecycleObserver = {
  on_create?: (sessionId: string, firedMessageId?: string) => void;
  on_finish?: (sessionId: string, reason: StreamEndReason) => void;
};

export class StreamRegistry {
  private readonly entries = new Map<string, StreamEntry>();
  /**
   * Pre-stream admission slots. They close the gap before `create()` where a
   * direct run may still be persisting its user tail. Queue drains and other
   * direct runs must lose synchronously instead of both mutating the transcript
   * and racing at the later stream reserve.
   */
  private readonly admissions = new Map<string, StreamAdmission>();
  /**
   * End-delivery barriers. An entry becomes `ended` immediately so late
   * consumers can replay its terminal reason, but the session remains occupied
   * until every consumer that was attached (or attaching) at `finish()` has
   * completed `on_end`. The recorder uses that callback to flush its durable
   * transcript, so publishing idle before this barrier settles lets a new turn
   * race ahead of a just-persisted approval/question.
   */
  private readonly settlements = new Map<string, StreamSettlement>();
  /** Attach/replay jobs not yet represented in `entry.consumers`. */
  private readonly attach_tasks = new WeakMap<
    StreamEntry,
    Set<Promise<void>>
  >();
  /**
   * Post-pump durability work that is not represented by an attached consumer.
   * The success path detaches the recorder before driving its terminal flush
   * itself (usage accounting depends on that flush). If abort lands during
   * that detached phase, its finish edge must still wait for the work before
   * publishing idle and admitting the next turn.
   */
  private readonly settlement_tasks = new WeakMap<
    StreamEntry,
    Set<Promise<unknown>>
  >();
  private readonly grace_ms: number;
  private consumer_seq = 0;
  private readonly observers = new Set<StreamLifecycleObserver>();

  constructor(opts: StreamRegistryOptions = {}) {
    this.grace_ms = opts.finish_grace_ms ?? 60_000;
  }

  /**
   * Attach a lifecycle observer. Attachable here (not the constructor) so it
   * works whether the registry was constructed locally or injected.
   * Multi-subscriber: each call ADDS an observer (never overwrites) and
   * returns its detach fn. Observer callbacks are invoked guarded and
   * independently — a throwing observer never breaks the registry's core
   * duty of decoupling model lifetime from consumers, nor delivery to the
   * other observers.
   */
  observe(observer: StreamLifecycleObserver): () => void {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }

  private notifyObservers(
    fn: (observer: StreamLifecycleObserver) => void
  ): void {
    for (const observer of this.observers) {
      try {
        fn(observer);
      } catch (err) {
        try {
          console.warn(
            `[stream-registry] observer error: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        } catch {
          /* never let logging break the registry */
        }
      }
    }
  }

  /**
   * Synchronously reserve the right to start the next turn for a session.
   * Throws the same error as {@link create} when either a stream or another
   * pre-stream admission already owns the session.
   */
  acquireAdmission(sessionId: string): StreamAdmission {
    if (
      this.admissions.has(sessionId) ||
      this.entries.get(sessionId)?.status === "running" ||
      this.settlements.has(sessionId)
    ) {
      throw new RunInFlightError(sessionId);
    }
    const admission: StreamAdmission = Object.freeze({
      session_id: sessionId,
    });
    this.admissions.set(sessionId, admission);
    return admission;
  }

  /**
   * Release an admission that did not reach {@link create}. Identity-guarded
   * so stale cleanup can never release a newer request's lease.
   */
  releaseAdmission(admission: StreamAdmission): void {
    if (this.admissions.get(admission.session_id) === admission) {
      this.admissions.delete(admission.session_id);
    }
  }

  /**
   * True while pre-stream admission, a running stream, or terminal consumer
   * settlement owns the session.
   */
  isOccupied(sessionId: string): boolean {
    return (
      this.admissions.has(sessionId) ||
      this.entries.get(sessionId)?.status === "running" ||
      this.settlements.has(sessionId)
    );
  }

  /** Reserve a new entry. Throws `RunInFlightError` if one is running.
   *  A previously-ended, fully-settled entry in its grace window is replaced.
   *  `replay_prefix` is assigned here — synchronously with the reserve — so
   *  no consumer can attach to an entry whose prefix isn't decided yet. */
  create(
    sessionId: string,
    opts?: {
      replay_prefix?: Promise<readonly string[]>;
      fired_message_id?: string;
      /** Exact pre-stream lease to consume during this reserve. */
      admission?: StreamAdmission;
    }
  ): StreamEntry {
    const admission = opts?.admission;
    const heldAdmission = this.admissions.get(sessionId);
    if (
      (admission && heldAdmission !== admission) ||
      (!admission && heldAdmission)
    ) {
      throw new RunInFlightError(sessionId);
    }
    const existing = this.entries.get(sessionId);
    if (existing?.status === "running" || this.settlements.has(sessionId)) {
      throw new RunInFlightError(sessionId);
    }
    if (existing) this.drop(sessionId);
    const entry: StreamEntry = {
      session_id: sessionId,
      fired_message_id: opts?.fired_message_id,
      model_abort: new AbortController(),
      status: "running",
      chunks: [],
      consumers: new Map(),
      replay_prefix: opts?.replay_prefix,
    };
    this.entries.set(sessionId, entry);
    if (admission) this.admissions.delete(sessionId);
    // Busy edge — AFTER the entry is in the map (throws above never notify).
    this.notifyObservers((o) =>
      o.on_create?.(sessionId, entry.fired_message_id)
    );
    return entry;
  }

  get(sessionId: string): StreamEntry | undefined {
    return this.entries.get(sessionId);
  }

  /**
   * Append + broadcast to the currently-owned generation. Silent no-op if the
   * session has no running entry.
   *
   * Long-lived pump callbacks must use {@link pushEntry}; this session-keyed
   * convenience is for synchronous host/test ingress that intentionally
   * targets whichever generation is current.
   */
  push(sessionId: string, data: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.pushEntry(entry, data);
  }

  /**
   * Append only while `entry` is the exact current running generation.
   *
   * A model promise can settle after its turn was aborted and a queued
   * replacement started under the same session id. Identity, not session id,
   * prevents that stale producer from injecting frames into the replacement.
   */
  pushEntry(entry: StreamEntry, data: string): boolean {
    if (
      this.entries.get(entry.session_id) !== entry ||
      entry.status !== "running"
    ) {
      return false;
    }
    entry.chunks.push(data);
    for (const c of entry.consumers.values()) {
      void this.deliver(entry, c, () => c.on_frame(data));
    }
    return true;
  }

  /**
   * Add durability work to this running entry's terminal settlement barrier.
   * Callers must register the task before detaching the consumer whose work it
   * represents. Identity + status checks make a late registration fail closed:
   * if abort already ended (or replacement invalidated) the entry, its attached
   * consumer remains responsible for terminal delivery.
   */
  trackSettlementTask(entry: StreamEntry, task: Promise<unknown>): boolean {
    if (
      this.entries.get(entry.session_id) !== entry ||
      entry.status !== "running"
    ) {
      return false;
    }
    let tasks = this.settlement_tasks.get(entry);
    if (!tasks) {
      tasks = new Set();
      this.settlement_tasks.set(entry, tasks);
    }
    tasks.add(task);
    const cleanup = () => {
      tasks?.delete(task);
    };
    void task.then(cleanup, cleanup);
    return true;
  }

  /**
   * Mark entry done and begin terminal delivery. The lifecycle finish edge and
   * grace timer wait for every current/pending consumer's `on_end` and every
   * explicitly tracked durability task to settle; until then admission remains
   * occupied. Idempotent.
   */
  finish(sessionId: string, reason: StreamEndReason): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.finishEntry(entry, reason);
  }

  /**
   * Finish only while `entry` is the exact current running generation.
   *
   * Explicit user abort remains session-keyed because it intentionally targets
   * the current turn. Async pump success/error paths must carry their captured
   * entry so a stale completion cannot finish a newer queued turn.
   */
  finishEntry(entry: StreamEntry, reason: StreamEndReason): boolean {
    const sessionId = entry.session_id;
    if (this.entries.get(sessionId) !== entry || entry.status !== "running") {
      return false;
    }
    entry.status = "ended";
    entry.end_reason = reason;
    // Occupy the session BEFORE invoking any consumer callback. `on_end` may
    // execute synchronously up to its first await, and a re-entrant admission
    // attempt from that stack must not observe an ended-but-unsettled gap.
    const placeholder: StreamSettlement = {
      entry,
      promise: Promise.resolve(),
    };
    this.settlements.set(sessionId, placeholder);
    const terminalDeliveries = Array.from(entry.consumers.values(), (c) =>
      this.deliver(entry, c, () => c.on_end(reason), /* detachAfter */ true)
    );
    // An attach can still be replaying when finish lands and therefore not yet
    // appear in `entry.consumers`. Its task observes `ended`, delivers on_end
    // after replay, and belongs to the same durability barrier.
    const pendingAttaches = Array.from(this.attach_tasks.get(entry) ?? []);
    // A successful pump may have detached the recorder so it can flush before
    // usage is stamped. Abort during that phase must still wait for the tracked
    // flush/accounting task before the lifecycle publishes idle.
    const pendingSettlementTasks = Array.from(
      this.settlement_tasks.get(entry) ?? []
    );
    const promise = Promise.allSettled([
      ...pendingAttaches,
      ...terminalDeliveries,
      ...pendingSettlementTasks,
    ]).then(() => {
      const settlement = this.settlements.get(sessionId);
      // `drop`/`clear` may have invalidated this entry and a replacement may now
      // own the same session id. A stale completion must neither publish that
      // replacement idle nor install a timer that later deletes it.
      if (
        settlement?.entry !== entry ||
        this.entries.get(sessionId) !== entry
      ) {
        return;
      }
      this.settlements.delete(sessionId);
      this.notifyObservers((o) => o.on_finish?.(sessionId, reason));
      entry.gc_timer = setTimeout(
        () => this.dropEntry(sessionId, entry),
        this.grace_ms
      );
    });
    // `allSettled().then` is always asynchronous, so replacing the placeholder
    // here precedes completion even when there are no consumers.
    if (this.settlements.get(sessionId) === placeholder) {
      this.settlements.set(sessionId, { entry, promise });
    }
    return true;
  }

  /** Explicit cancel: abort the upstream signal then `finish("abort")`. */
  abort(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry || entry.status !== "running") return;
    entry.model_abort.abort();
    this.finishEntry(entry, "abort");
  }

  /**
   * Attach a consumer. Replays every buffered frame in insertion order
   * then live-tails. If the entry already ended, fires `onEnd` after
   * replay. Returns detach fn.
   *
   * `replay_prefix: true` (reconnect consumers ONLY) additionally serves
   * the entry's continuation prefix BEFORE the buffered replay — see
   * `replay-prefix.ts`. Default false: the run-response consumer would
   * duplicate the live message's parts and the recorder would
   * double-persist rows.
   */
  attach(
    sessionId: string,
    consumer: StreamConsumer,
    opts?: { replay_prefix?: boolean }
  ): () => void {
    const entry = this.entries.get(sessionId);
    if (!entry) throw new Error(`stream entry not found: ${sessionId}`);
    const id = `c${++this.consumer_seq}`;
    let detached = false;
    const detach = () => {
      detached = true;
      entry.consumers.delete(id);
    };
    const task = (async () => {
      try {
        if (opts?.replay_prefix && entry.replay_prefix) {
          // Never rejects by contract (the builder degrades to []); frames
          // precede the buffer so the client reducer sees the continued
          // message's head before the live turn's own chunks.
          const prefix = await entry.replay_prefix;
          for (const frame of prefix) {
            if (detached) return;
            await consumer.on_frame(frame);
          }
        }
        // Replay buffered frames first, catching up to whatever is live.
        // The consumer is NOT registered for live delivery until replay
        // has drained every currently-buffered frame: registering it up
        // front lets a concurrent push() deliver the same frame twice
        // (once live, once via this replay) and out of order. We re-read
        // `entry.chunks.length` each iteration so frames pushed mid-replay
        // are still picked up, in order.
        let i = 0;
        while (i < entry.chunks.length) {
          if (detached) return;
          await consumer.on_frame(entry.chunks[i]!);
          i++;
        }
        if (detached) return;
        // Caught up. There is no `await` between the loop's final length
        // check and this registration, so a synchronous push() cannot
        // interleave and slip a frame past us.
        if (entry.status === "running") {
          entry.consumers.set(id, consumer);
        } else {
          await consumer.on_end(entry.end_reason ?? "finish");
        }
      } catch (err) {
        detach();
        consumer.on_error?.(err);
      }
    })();
    let tasks = this.attach_tasks.get(entry);
    if (!tasks) {
      tasks = new Set();
      this.attach_tasks.set(entry, tasks);
    }
    tasks.add(task);
    void task.finally(() => {
      tasks?.delete(task);
    });
    return detach;
  }

  /** Force-drop an entry. Aborts model if still running. */
  drop(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.dropEntry(sessionId, entry);
  }

  private dropEntry(sessionId: string, entry: StreamEntry): void {
    if (this.entries.get(sessionId) !== entry) return;
    if (entry.gc_timer) clearTimeout(entry.gc_timer);
    if (entry.status === "running") entry.model_abort.abort();
    entry.consumers.clear();
    this.entries.delete(sessionId);
    if (this.settlements.get(sessionId)?.entry === entry) {
      this.settlements.delete(sessionId);
    }
  }

  /** Test teardown: drop all entries. */
  clear(): void {
    for (const [id, entry] of Array.from(this.entries)) {
      this.dropEntry(id, entry);
    }
    this.admissions.clear();
    this.settlements.clear();
  }

  private async deliver(
    entry: StreamEntry,
    consumer: StreamConsumer,
    op: () => void | Promise<void>,
    detachAfter = false
  ): Promise<void> {
    try {
      await op();
    } catch (err) {
      try {
        consumer.on_error?.(err);
      } catch {
        /* never let logger break broadcast */
      }
      for (const [id, c] of entry.consumers) {
        if (c === consumer) {
          entry.consumers.delete(id);
          return;
        }
      }
      return;
    }
    if (detachAfter) {
      for (const [id, c] of entry.consumers) {
        if (c === consumer) {
          entry.consumers.delete(id);
          return;
        }
      }
    }
  }
}
