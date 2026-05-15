import { describe, it, expect } from "vitest";
import { HitRegions } from "../event/hit-regions";

describe("HitRegions", () => {
  it("returns null on empty", () => {
    const r = new HitRegions();
    expect(r.hitTest([0, 0])).toBeNull();
    expect(r.isEmpty()).toBe(true);
  });

  it("hit-tests AABB containment", () => {
    const r = new HitRegions();
    r.push({
      rect: { x: 10, y: 10, width: 20, height: 20 },
      action: { kind: "select_node", id: "a" },
      priority: 30,
      label: "select:a",
    });
    expect(r.hitTest([5, 5])).toBeNull();
    expect(r.hitTest([15, 15])?.kind).toBe("select_node");
    expect(r.hitTest([30, 30])).not.toBeNull(); // exactly on edge
    expect(r.hitTest([31, 31])).toBeNull();
  });

  it("clear() resets", () => {
    const r = new HitRegions();
    r.push({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      action: { kind: "select_node", id: "a" },
      priority: 30,
      label: "select:a",
    });
    expect(r.isEmpty()).toBe(false);
    r.clear();
    expect(r.isEmpty()).toBe(true);
    expect(r.hitTest([5, 5])).toBeNull();
  });

  // ── Priority resolution ─────────────────────────────────────────────────

  it("lowest priority wins on overlap (priority is data, not iteration)", () => {
    const r = new HitRegions();
    // Push the high-priority region first; without priority-based resolution
    // a reverse-iteration model would let the later push win.
    r.push({
      rect: { x: 0, y: 0, width: 100, height: 100 },
      action: { kind: "select_node", id: "low_priority_value_wins" },
      priority: 10,
      label: "front",
    });
    r.push({
      rect: { x: 40, y: 40, width: 20, height: 20 },
      action: { kind: "select_node", id: "higher_priority_value_loses" },
      priority: 30,
      label: "back",
    });
    const hit = r.hitTest([50, 50]);
    expect(hit && hit.kind === "select_node" && hit.id).toBe(
      "low_priority_value_wins"
    );
  });

  it("ties broken by push order — later wins", () => {
    const r = new HitRegions();
    r.push({
      rect: { x: 0, y: 0, width: 100, height: 100 },
      action: { kind: "select_node", id: "first" },
      priority: 20,
      label: "first",
    });
    r.push({
      rect: { x: 0, y: 0, width: 100, height: 100 },
      action: { kind: "select_node", id: "second" },
      priority: 20,
      label: "second",
    });
    const hit = r.hitTest([50, 50]);
    expect(hit && hit.kind === "select_node" && hit.id).toBe("second");
  });

  it("hitTestRegion returns label + priority for tests/debug", () => {
    const r = new HitRegions();
    r.push({
      rect: { x: 0, y: 0, width: 50, height: 50 },
      action: { kind: "select_node", id: "a" },
      priority: 25,
      label: "translate",
    });
    const hit = r.hitTestRegion([10, 10]);
    expect(hit?.label).toBe("translate");
    expect(hit?.priority).toBe(25);
  });
});
