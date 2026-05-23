// MemoizedGeometryProvider unit tests. Uses a FakeGeometryDriver so the
// tests are DOM-free.

import { describe, expect, it } from "vitest";
import {
  MemoizedGeometryProvider,
  type GeometryProvider,
} from "../src/core/geometry";
import type { NodeId, Rect, Unsubscribe, Vec2 } from "../src/types";

class FakeGeometryDriver implements GeometryProvider {
  bounds_of_calls = 0;
  bounds_of_many_calls = 0;
  constructor(private rects: Map<NodeId, Rect>) {}
  bounds_of(id: NodeId): Rect | null {
    this.bounds_of_calls++;
    return this.rects.get(id) ?? null;
  }
  bounds_of_many(ids: ReadonlyArray<NodeId>): Map<NodeId, Rect> {
    this.bounds_of_many_calls++;
    const out = new Map<NodeId, Rect>();
    for (const id of ids) {
      const r = this.rects.get(id);
      if (r) out.set(id, r);
    }
    return out;
  }
  nodes_in_rect(_r: Rect): NodeId[] {
    return [];
  }
  node_at_point(_p: Vec2): NodeId | null {
    return null;
  }
}

class FakeSignals {
  private structure = new Set<() => void>();
  private geometry = new Set<() => void>();
  subscribe_structure(cb: () => void): Unsubscribe {
    this.structure.add(cb);
    return () => this.structure.delete(cb);
  }
  subscribe_geometry(cb: () => void): Unsubscribe {
    this.geometry.add(cb);
    return () => this.geometry.delete(cb);
  }
  bump_structure() {
    for (const cb of this.structure) cb();
  }
  bump_geometry() {
    for (const cb of this.geometry) cb();
  }
  has_structure_listener() {
    return this.structure.size > 0;
  }
  has_geometry_listener() {
    return this.geometry.size > 0;
  }
}

function setup() {
  const rects = new Map<NodeId, Rect>([
    ["a", { x: 0, y: 0, width: 10, height: 10 }],
    ["b", { x: 20, y: 0, width: 10, height: 10 }],
  ]);
  const driver = new FakeGeometryDriver(rects);
  const signals = new FakeSignals();
  const memo = new MemoizedGeometryProvider(driver, {
    subscribe_structure: (cb) => signals.subscribe_structure(cb),
    subscribe_geometry: (cb) => signals.subscribe_geometry(cb),
  });
  return { driver, signals, memo };
}

describe("MemoizedGeometryProvider", () => {
  it("caches bounds_of: repeat reads hit driver only once", () => {
    const { driver, memo } = setup();
    expect(memo.bounds_of("a")).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(memo.bounds_of("a")).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(memo.bounds_of("a")).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(driver.bounds_of_calls).toBe(1);
  });

  it("caches null results too (don't keep asking the driver for orphans)", () => {
    const { driver, memo } = setup();
    expect(memo.bounds_of("missing")).toBeNull();
    expect(memo.bounds_of("missing")).toBeNull();
    expect(driver.bounds_of_calls).toBe(1);
  });

  it("clears cache on structure bump", () => {
    const { driver, signals, memo } = setup();
    memo.bounds_of("a");
    signals.bump_structure();
    memo.bounds_of("a");
    expect(driver.bounds_of_calls).toBe(2);
  });

  it("clears cache on geometry bump", () => {
    const { driver, signals, memo } = setup();
    memo.bounds_of("a");
    signals.bump_geometry();
    memo.bounds_of("a");
    expect(driver.bounds_of_calls).toBe(2);
  });

  it("bounds_of_many: only missing ids hit the driver; result populates cache", () => {
    const { driver, memo } = setup();
    memo.bounds_of("a"); // primes cache for `a`
    expect(driver.bounds_of_calls).toBe(1);
    expect(driver.bounds_of_many_calls).toBe(0);

    const result = memo.bounds_of_many(["a", "b"]);
    expect(result.size).toBe(2);
    // driver.bounds_of_many should be called for ["b"] only
    expect(driver.bounds_of_many_calls).toBe(1);

    // Subsequent reads of `b` come from cache
    memo.bounds_of("b");
    expect(driver.bounds_of_calls).toBe(1); // still 1, came from cache
  });

  it("bounds_of_many: empty input is a no-op (no driver call)", () => {
    const { driver, memo } = setup();
    const result = memo.bounds_of_many([]);
    expect(result.size).toBe(0);
    expect(driver.bounds_of_many_calls).toBe(0);
  });

  it("dispose() unsubscribes from both signals", () => {
    const { signals, memo } = setup();
    expect(signals.has_structure_listener()).toBe(true);
    expect(signals.has_geometry_listener()).toBe(true);
    memo.dispose();
    expect(signals.has_structure_listener()).toBe(false);
    expect(signals.has_geometry_listener()).toBe(false);
  });
});
