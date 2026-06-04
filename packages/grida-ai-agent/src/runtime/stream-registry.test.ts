/* eslint-disable vitest/require-mock-type-parameters */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StreamRegistry,
  RunInFlightError,
  type StreamConsumer,
} from "./stream-registry";

function makeConsumer(): StreamConsumer & {
  frames: string[];
  ended: string[];
  errors: unknown[];
} {
  const frames: string[] = [];
  const ended: string[] = [];
  const errors: unknown[] = [];
  return {
    frames,
    ended,
    errors,
    on_frame: (data) => {
      frames.push(data);
    },
    on_end: (reason) => {
      ended.push(reason);
    },
    on_error: (err) => {
      errors.push(err);
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

let registry: StreamRegistry;

beforeEach(() => {
  registry = new StreamRegistry({ finish_grace_ms: 1000 });
});

afterEach(() => {
  registry.clear();
});

describe("StreamRegistry / create + get + drop", () => {
  it("creates a fresh entry for an unseen sessionId", () => {
    const entry = registry.create("ses_a");
    expect(entry.status).toBe("running");
    expect(entry.chunks).toEqual([]);
    expect(registry.get("ses_a")).toBe(entry);
  });

  it("rejects create when one is already running", () => {
    registry.create("ses_a");
    expect(() => registry.create("ses_a")).toThrow(RunInFlightError);
  });

  it("replaces an entry in its finished grace window", () => {
    const first = registry.create("ses_a");
    registry.push("ses_a", "frame-1");
    registry.finish("ses_a", "finish");
    expect(registry.get("ses_a")?.status).toBe("ended");

    const second = registry.create("ses_a");
    expect(second).not.toBe(first);
    expect(second.status).toBe("running");
    expect(second.chunks).toEqual([]);
  });

  it("drop removes the entry and aborts the model if still running", () => {
    const entry = registry.create("ses_a");
    const onAbort = vi.fn();
    entry.model_abort.signal.addEventListener("abort", onAbort);
    registry.drop("ses_a");
    expect(registry.get("ses_a")).toBeUndefined();
    expect(onAbort).toHaveBeenCalledOnce();
  });
});

describe("StreamRegistry / push + broadcast", () => {
  it("broadcasts new frames to all attached consumers", async () => {
    registry.create("ses_a");
    const c1 = makeConsumer();
    const c2 = makeConsumer();
    registry.attach("ses_a", c1);
    registry.attach("ses_a", c2);
    registry.push("ses_a", "hello");
    registry.push("ses_a", "world");
    await flushMicrotasks();
    expect(c1.frames).toEqual(["hello", "world"]);
    expect(c2.frames).toEqual(["hello", "world"]);
  });

  it("silently no-ops when pushing to an unknown sessionId", () => {
    expect(() => registry.push("ses_missing", "x")).not.toThrow();
  });

  it("survives a consumer that throws — drops it and keeps broadcasting", async () => {
    registry.create("ses_a");
    const bad = makeConsumer();
    bad.on_frame = vi.fn(() => {
      throw new Error("boom");
    });
    const good = makeConsumer();
    registry.attach("ses_a", bad);
    registry.attach("ses_a", good);
    registry.push("ses_a", "x");
    await flushMicrotasks();
    expect(good.frames).toEqual(["x"]);
    registry.push("ses_a", "y");
    await flushMicrotasks();
    expect(good.frames).toEqual(["x", "y"]);
    expect(bad.errors).toHaveLength(1);
  });
});

describe("StreamRegistry / attach + replay", () => {
  it("replays all buffered frames in order on attach", async () => {
    registry.create("ses_a");
    registry.push("ses_a", "a");
    registry.push("ses_a", "b");
    registry.push("ses_a", "c");
    const c = makeConsumer();
    registry.attach("ses_a", c);
    await flushMicrotasks();
    expect(c.frames).toEqual(["a", "b", "c"]);
  });

  it("delivers live frames after replay completes", async () => {
    registry.create("ses_a");
    registry.push("ses_a", "a");
    const c = makeConsumer();
    registry.attach("ses_a", c);
    await flushMicrotasks();
    expect(c.frames).toEqual(["a"]);
    registry.push("ses_a", "b");
    await flushMicrotasks();
    expect(c.frames).toEqual(["a", "b"]);
  });

  it("fires onEnd immediately after replay if entry already ended", async () => {
    registry.create("ses_a");
    registry.push("ses_a", "a");
    registry.finish("ses_a", "finish");
    const c = makeConsumer();
    registry.attach("ses_a", c);
    await flushMicrotasks();
    expect(c.frames).toEqual(["a"]);
    expect(c.ended).toEqual(["finish"]);
  });

  it("propagates the abort reason on late attach to aborted run", async () => {
    registry.create("ses_a");
    registry.push("ses_a", "a");
    registry.abort("ses_a");
    const c = makeConsumer();
    registry.attach("ses_a", c);
    await flushMicrotasks();
    expect(c.ended).toEqual(["abort"]);
  });

  it("detach stops further frames reaching that consumer", async () => {
    registry.create("ses_a");
    const c = makeConsumer();
    const detach = registry.attach("ses_a", c);
    registry.push("ses_a", "a");
    await flushMicrotasks();
    detach();
    registry.push("ses_a", "b");
    await flushMicrotasks();
    expect(c.frames).toEqual(["a"]);
  });

  it("does not duplicate or reorder frames pushed during replay", async () => {
    // Regression: the consumer must not be registered for live delivery
    // until replay has drained. With a slow (async) onFrame, frames pushed
    // while replay is in flight would otherwise arrive twice (live + replay)
    // and out of order.
    registry.create("ses_a");
    registry.push("ses_a", "a");
    const frames: string[] = [];
    const slow: StreamConsumer = {
      on_frame: async (d) => {
        frames.push(d);
        await Promise.resolve();
      },
      on_end: () => {},
    };
    registry.attach("ses_a", slow);
    // Push synchronously, before the async replay has caught up.
    registry.push("ses_a", "b");
    registry.push("ses_a", "c");
    await flushMicrotasks();
    expect(frames).toEqual(["a", "b", "c"]);
  });
});

describe("StreamRegistry / finish + abort + onEnd", () => {
  it("finish broadcasts onEnd('finish') to all consumers", async () => {
    registry.create("ses_a");
    const c1 = makeConsumer();
    const c2 = makeConsumer();
    registry.attach("ses_a", c1);
    registry.attach("ses_a", c2);
    registry.finish("ses_a", "finish");
    await flushMicrotasks();
    expect(c1.ended).toEqual(["finish"]);
    expect(c2.ended).toEqual(["finish"]);
  });

  it("abort cancels modelAbort and broadcasts onEnd('abort')", async () => {
    const entry = registry.create("ses_a");
    const onAbortSignal = vi.fn();
    entry.model_abort.signal.addEventListener("abort", onAbortSignal);
    const c = makeConsumer();
    registry.attach("ses_a", c);
    registry.abort("ses_a");
    await flushMicrotasks();
    expect(onAbortSignal).toHaveBeenCalledOnce();
    expect(c.ended).toEqual(["abort"]);
    expect(registry.get("ses_a")?.status).toBe("ended");
  });

  it("finish is idempotent — second call is a no-op", async () => {
    registry.create("ses_a");
    const c = makeConsumer();
    registry.attach("ses_a", c);
    registry.finish("ses_a", "finish");
    registry.finish("ses_a", "abort");
    await flushMicrotasks();
    expect(c.ended).toEqual(["finish"]);
  });
});

describe("StreamRegistry / GC", () => {
  it("drops the entry after the grace period", () => {
    vi.useFakeTimers();
    const r = new StreamRegistry({ finish_grace_ms: 5_000 });
    r.create("ses_a");
    r.finish("ses_a", "finish");
    expect(r.get("ses_a")).toBeDefined();
    vi.advanceTimersByTime(4_999);
    expect(r.get("ses_a")).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(r.get("ses_a")).toBeUndefined();
    vi.useRealTimers();
  });
});

describe("StreamRegistry / lifecycle observer", () => {
  it("notifies on_create (busy edge) and on_finish (idle edge) at the chokepoints", () => {
    const r = new StreamRegistry();
    const created: string[] = [];
    const finished: Array<[string, string]> = [];
    r.observe({
      on_create: (sid) => created.push(sid),
      on_finish: (sid, reason) => finished.push([sid, reason]),
    });

    r.create("ses_a");
    expect(created).toEqual(["ses_a"]);
    expect(finished).toEqual([]);

    r.finish("ses_a", "finish");
    expect(finished).toEqual([["ses_a", "finish"]]);

    // The abort path funnels through finish — observer sees a single
    // on_finish("abort"), the same chokepoint.
    r.create("ses_b");
    r.abort("ses_b");
    expect(created).toEqual(["ses_a", "ses_b"]);
    expect(finished).toEqual([
      ["ses_a", "finish"],
      ["ses_b", "abort"],
    ]);
  });

  it("does not notify on_create when create throws RunInFlightError", () => {
    const r = new StreamRegistry();
    const created: string[] = [];
    r.observe({ on_create: (sid) => created.push(sid) });
    r.create("ses_a");
    expect(() => r.create("ses_a")).toThrow(RunInFlightError);
    expect(created).toEqual(["ses_a"]); // the rejected second create did NOT notify
  });

  it("a throwing observer never breaks the registry's core duty", async () => {
    const r = new StreamRegistry();
    r.observe({
      on_create: () => {
        throw new Error("boom");
      },
      on_finish: () => {
        throw new Error("boom");
      },
    });
    // create + finish still work; a consumer still gets its frames + end.
    expect(() => r.create("ses_a")).not.toThrow();
    const c = makeConsumer();
    r.attach("ses_a", c);
    r.push("ses_a", "f1");
    expect(() => r.finish("ses_a", "finish")).not.toThrow();
    await Promise.resolve();
    expect(c.frames).toEqual(["f1"]);
    expect(c.ended).toEqual(["finish"]);
  });
});
