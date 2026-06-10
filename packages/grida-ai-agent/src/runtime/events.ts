/**
 * AgentEventBus — the in-process half of the lifecycle event channel
 * (RFC `docs/wg/ai/agent/events.md`).
 *
 * Owns one task only: fan a {@link AgentLifecycleEvent} out to N
 * subscribers. Multi-subscriber by construction (a Set — attaching one
 * listener never displaces another), volatile (no buffer, no replay: a
 * late joiner sees only future events), and observe-only (nothing a
 * listener returns or throws reaches the emitter — the core never
 * waits on, and can never be vetoed by, a consumer).
 *
 * The runtime emits; the host-wide SSE route (`GET /events`,
 * `events-sse.ts`) is the projection out-of-process consumers tail.
 */

import type { AgentLifecycleEvent } from "../protocol/events";

type EventListener = (event: AgentLifecycleEvent) => void;

export class AgentEventBus {
  private readonly listeners = new Set<EventListener>();

  /**
   * Attach a listener for every lifecycle event. Returns its detach fn.
   * The listener is invoked synchronously at emit, guarded — a throwing
   * listener never breaks delivery to the rest, nor the emitter.
   */
  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Core-internal: broadcast one event. Fire-and-forget, per-listener guarded. */
  emit(event: AgentLifecycleEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* never let one listener break the broadcast */
      }
    }
  }

  /** Detach everything (host shutdown / test teardown). */
  dispose(): void {
    this.listeners.clear();
  }
}
