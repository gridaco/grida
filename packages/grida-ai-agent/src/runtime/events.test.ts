/**
 * Contract pins for the in-process half of the lifecycle event channel
 * (RFC `docs/wg/ai/agent/events.md` §semantics): multi-subscriber
 * fan-out, listener-failure isolation, detach, no replay. The
 * runtime-emission side (which events a turn produces, ordering, the
 * pending-approval flavor) is pinned in `http/routes/agent-events.test.ts`
 * against a real run loop.
 */
import { describe, expect, it } from "vitest";
import { AgentEventBus } from "./events";
import type { AgentLifecycleEvent } from "../protocol/events";

const started = (sessionId: string): AgentLifecycleEvent => ({
  type: "turn-started",
  session_id: sessionId,
  at: 1,
});

describe("AgentEventBus", () => {
  it("fans one emit out to every subscriber", () => {
    const bus = new AgentEventBus();
    const a: string[] = [];
    const b: string[] = [];
    bus.subscribe((e) => a.push(e.session_id));
    bus.subscribe((e) => b.push(e.session_id));

    bus.emit(started("ses_a"));
    expect(a).toEqual(["ses_a"]);
    expect(b).toEqual(["ses_a"]);
  });

  it("a throwing listener never breaks delivery to the rest or the emitter", () => {
    const bus = new AgentEventBus();
    const seen: string[] = [];
    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe((e) => seen.push(e.session_id));

    expect(() => bus.emit(started("ses_a"))).not.toThrow();
    expect(seen).toEqual(["ses_a"]);
  });

  it("subscribe() returns a detach fn that removes only that listener", () => {
    const bus = new AgentEventBus();
    const kept: string[] = [];
    const dropped: string[] = [];
    const detach = bus.subscribe((e) => dropped.push(e.session_id));
    bus.subscribe((e) => kept.push(e.session_id));

    bus.emit(started("ses_a"));
    detach();
    bus.emit(started("ses_b"));

    expect(dropped).toEqual(["ses_a"]);
    expect(kept).toEqual(["ses_a", "ses_b"]);
  });

  it("is volatile: a late joiner sees only future events (no replay)", () => {
    const bus = new AgentEventBus();
    bus.emit(started("ses_a"));
    const late: string[] = [];
    bus.subscribe((e) => late.push(e.session_id));
    bus.emit(started("ses_b"));
    expect(late).toEqual(["ses_b"]);
  });
});
