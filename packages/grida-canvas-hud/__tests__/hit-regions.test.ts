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
    });
    expect(r.hitTest([5, 5])).toBeNull();
    expect(r.hitTest([15, 15])?.kind).toBe("select_node");
    expect(r.hitTest([30, 30])).not.toBeNull(); // exactly on edge
    expect(r.hitTest([31, 31])).toBeNull();
  });

  it("topmost (last-pushed) wins", () => {
    const r = new HitRegions();
    r.push({
      rect: { x: 0, y: 0, width: 100, height: 100 },
      action: { kind: "select_node", id: "back" },
    });
    r.push({
      rect: { x: 40, y: 40, width: 20, height: 20 },
      action: { kind: "select_node", id: "front" },
    });
    const hit = r.hitTest([50, 50]);
    expect(hit && hit.kind === "select_node" && hit.id).toBe("front");
  });

  it("clear() resets", () => {
    const r = new HitRegions();
    r.push({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      action: { kind: "select_node", id: "a" },
    });
    expect(r.isEmpty()).toBe(false);
    r.clear();
    expect(r.isEmpty()).toBe(true);
    expect(r.hitTest([5, 5])).toBeNull();
  });
});
