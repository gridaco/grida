// Picker + memoizer unit tests. DOM-free; uses fake drivers so the
// surface coordinate / camera plumbing is out of scope.

import { describe, expect, it } from "vitest";
import {
  MemoizedHitShapeProvider,
  pick_at_world,
  type HitShape,
  type HitShapeDriver,
} from "../../src/core/hit-shape";
import type { NodeId, Rect, Unsubscribe } from "../../src/types";

class FakeHitShapeDriver implements HitShapeDriver {
  calls = 0;
  constructor(private shapes: Map<NodeId, HitShape | null>) {}
  hit_shape_of(id: NodeId): HitShape | null {
    this.calls++;
    return this.shapes.get(id) ?? null;
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

describe("MemoizedHitShapeProvider", () => {
  it("caches hit_shape_of: repeat reads hit driver only once", () => {
    const driver = new FakeHitShapeDriver(
      new Map<NodeId, HitShape | null>([
        ["a", { kind: "rect", x: 0, y: 0, width: 10, height: 10 }],
      ])
    );
    const signals = new FakeSignals();
    const memo = new MemoizedHitShapeProvider(driver, {
      subscribe_structure: (cb) => signals.subscribe_structure(cb),
      subscribe_geometry: (cb) => signals.subscribe_geometry(cb),
    });
    memo.hit_shape_of("a");
    memo.hit_shape_of("a");
    expect(driver.calls).toBe(1);
  });

  it("caches null results", () => {
    const driver = new FakeHitShapeDriver(new Map());
    const signals = new FakeSignals();
    const memo = new MemoizedHitShapeProvider(driver, {
      subscribe_structure: (cb) => signals.subscribe_structure(cb),
      subscribe_geometry: (cb) => signals.subscribe_geometry(cb),
    });
    expect(memo.hit_shape_of("missing")).toBeNull();
    expect(memo.hit_shape_of("missing")).toBeNull();
    expect(driver.calls).toBe(1);
  });

  it("clears cache on structure / geometry bump", () => {
    const driver = new FakeHitShapeDriver(
      new Map<NodeId, HitShape | null>([
        ["a", { kind: "rect", x: 0, y: 0, width: 10, height: 10 }],
      ])
    );
    const signals = new FakeSignals();
    const memo = new MemoizedHitShapeProvider(driver, {
      subscribe_structure: (cb) => signals.subscribe_structure(cb),
      subscribe_geometry: (cb) => signals.subscribe_geometry(cb),
    });
    memo.hit_shape_of("a");
    signals.bump_structure();
    memo.hit_shape_of("a");
    expect(driver.calls).toBe(2);
    signals.bump_geometry();
    memo.hit_shape_of("a");
    expect(driver.calls).toBe(3);
  });

  it("dispose() unsubscribes from both signals", () => {
    const driver = new FakeHitShapeDriver(new Map());
    const signals = new FakeSignals();
    const memo = new MemoizedHitShapeProvider(driver, {
      subscribe_structure: (cb) => signals.subscribe_structure(cb),
      subscribe_geometry: (cb) => signals.subscribe_geometry(cb),
    });
    expect(signals.has_structure_listener()).toBe(true);
    expect(signals.has_geometry_listener()).toBe(true);
    memo.dispose();
    expect(signals.has_structure_listener()).toBe(false);
    expect(signals.has_geometry_listener()).toBe(false);
  });
});

describe("pick_at_world", () => {
  function setup(
    items: Array<{ id: NodeId; bounds: Rect; shape: HitShape | null }>
  ) {
    const ids = items.map((i) => i.id);
    const bounds_map = new Map(items.map((i) => [i.id, i.bounds]));
    const shape_map = new Map(items.map((i) => [i.id, i.shape]));
    return {
      ordered_ids: ids,
      bounds_of: (id: NodeId) => bounds_map.get(id) ?? null,
      hit_shape_of: (id: NodeId) => shape_map.get(id) ?? null,
    };
  }

  it("returns null when no candidate is within tolerance", () => {
    const ctx = setup([
      {
        id: "line",
        bounds: { x: 0, y: 0, width: 100, height: 0 },
        shape: { kind: "segment", a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      },
    ]);
    expect(
      pick_at_world({ x: 50, y: 10 }, { ...ctx, tolerance_world: 4 })
    ).toBeNull();
  });

  it("returns id when click is within tolerance of a thin segment", () => {
    const ctx = setup([
      {
        id: "line",
        bounds: { x: 0, y: 0, width: 100, height: 0 },
        shape: { kind: "segment", a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      },
    ]);
    expect(pick_at_world({ x: 50, y: 3 }, { ...ctx, tolerance_world: 4 })).toBe(
      "line"
    );
  });

  it("walks topmost-first (later in ordered_ids wins)", () => {
    const ctx = setup([
      {
        id: "back",
        bounds: { x: 0, y: 0, width: 20, height: 20 },
        shape: { kind: "rect", x: 0, y: 0, width: 20, height: 20 },
      },
      {
        id: "front",
        bounds: { x: 5, y: 5, width: 10, height: 10 },
        shape: { kind: "rect", x: 5, y: 5, width: 10, height: 10 },
      },
    ]);
    // (10, 10) is inside both. The later id (front) wins.
    expect(
      pick_at_world({ x: 10, y: 10 }, { ...ctx, tolerance_world: 0 })
    ).toBe("front");
  });

  it("AABB pre-filter rejects far-away candidates without distance compute", () => {
    let shape_reads = 0;
    const wrapped: HitShape = {
      kind: "segment",
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
    };
    const result = pick_at_world(
      { x: 1000, y: 1000 },
      {
        tolerance_world: 4,
        ordered_ids: ["far"],
        bounds_of: () => ({ x: 0, y: 0, width: 10, height: 0 }),
        hit_shape_of: () => {
          shape_reads++;
          return wrapped;
        },
      }
    );
    expect(result).toBeNull();
    expect(shape_reads).toBe(0);
  });

  it("skips candidates whose driver returns null shape", () => {
    const ctx = setup([
      {
        id: "no-shape",
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        shape: null,
      },
    ]);
    expect(
      pick_at_world({ x: 50, y: 50 }, { ...ctx, tolerance_world: 4 })
    ).toBeNull();
  });

  it("tolerance threshold: just-within hits, just-outside misses", () => {
    const ctx = setup([
      {
        id: "line",
        bounds: { x: 0, y: 0, width: 100, height: 0 },
        shape: { kind: "segment", a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      },
    ]);
    // Just-within: distance 3.9 < tolerance 4.
    expect(
      pick_at_world({ x: 50, y: 3.9 }, { ...ctx, tolerance_world: 4 })
    ).toBe("line");
    // Just-outside: distance 4.1 > tolerance 4.
    expect(
      pick_at_world({ x: 50, y: 4.1 }, { ...ctx, tolerance_world: 4 })
    ).toBeNull();
  });
});
