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
  readonly model_abort: AbortController;
  status: "running" | "ended";
  end_reason?: StreamEndReason;
  chunks: string[];
  consumers: Map<string, StreamConsumer>;
  gc_timer?: ReturnType<typeof setTimeout>;
};

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
  on_create?: (sessionId: string) => void;
  on_finish?: (sessionId: string, reason: StreamEndReason) => void;
};

export class StreamRegistry {
  private readonly entries = new Map<string, StreamEntry>();
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

  /** Reserve a new entry. Throws `RunInFlightError` if one is running.
   *  A previously-ended entry in its grace window is replaced. */
  create(sessionId: string): StreamEntry {
    const existing = this.entries.get(sessionId);
    if (existing?.status === "running") throw new RunInFlightError(sessionId);
    if (existing) this.drop(sessionId);
    const entry: StreamEntry = {
      session_id: sessionId,
      model_abort: new AbortController(),
      status: "running",
      chunks: [],
      consumers: new Map(),
    };
    this.entries.set(sessionId, entry);
    // Busy edge — AFTER the entry is in the map (throws above never notify).
    this.notifyObservers((o) => o.on_create?.(sessionId));
    return entry;
  }

  get(sessionId: string): StreamEntry | undefined {
    return this.entries.get(sessionId);
  }

  /** Append + broadcast. Silent no-op if entry is gone. */
  push(sessionId: string, data: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    entry.chunks.push(data);
    for (const c of entry.consumers.values()) {
      void this.deliver(entry, c, () => c.on_frame(data));
    }
  }

  /** Mark entry done, broadcast onEnd, schedule GC. Idempotent. */
  finish(sessionId: string, reason: StreamEndReason): void {
    const entry = this.entries.get(sessionId);
    if (!entry || entry.status !== "running") return;
    entry.status = "ended";
    entry.end_reason = reason;
    for (const c of entry.consumers.values()) {
      void this.deliver(
        entry,
        c,
        () => c.on_end(reason),
        /* detachAfter */ true
      );
    }
    entry.gc_timer = setTimeout(() => this.drop(sessionId), this.grace_ms);
    // Idle/error edge — AFTER the entry is marked ended + consumers notified,
    // so an observer that triggers a drain sees a consistent ended entry. The
    // drain it schedules runs on a fresh task, never re-entrantly here.
    this.notifyObservers((o) => o.on_finish?.(sessionId, reason));
  }

  /** Explicit cancel: abort the upstream signal then `finish("abort")`. */
  abort(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry || entry.status !== "running") return;
    entry.model_abort.abort();
    this.finish(sessionId, "abort");
  }

  /**
   * Attach a consumer. Replays every buffered frame in insertion order
   * then live-tails. If the entry already ended, fires `onEnd` after
   * replay. Returns detach fn.
   */
  attach(sessionId: string, consumer: StreamConsumer): () => void {
    const entry = this.entries.get(sessionId);
    if (!entry) throw new Error(`stream entry not found: ${sessionId}`);
    const id = `c${++this.consumer_seq}`;
    let detached = false;
    const detach = () => {
      detached = true;
      entry.consumers.delete(id);
    };
    void (async () => {
      try {
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
    return detach;
  }

  /** Force-drop an entry. Aborts model if still running. */
  drop(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    if (entry.gc_timer) clearTimeout(entry.gc_timer);
    if (entry.status === "running") entry.model_abort.abort();
    entry.consumers.clear();
    this.entries.delete(sessionId);
  }

  /** Test teardown: drop all entries. */
  clear(): void {
    for (const id of Array.from(this.entries.keys())) this.drop(id);
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
