import { describe, expect, test } from "vitest";
import { compute_align_deltas } from "../src/core/align";

describe("compute_align_deltas — multi against union", () => {
  const members = [
    { id: "a", bbox: { x: 0, y: 0, width: 10, height: 10 } },
    { id: "b", bbox: { x: 20, y: 30, width: 40, height: 20 } },
    { id: "c", bbox: { x: 80, y: 70, width: 10, height: 5 } },
  ];
  // Union (computed by caller): x=[0..90], y=[0..75], center (45, 37.5)
  const union = { x: 0, y: 0, width: 90, height: 75 };

  test("left → moving members get dx; already-aligned member omitted", () => {
    const d = compute_align_deltas(members, union, "left");
    expect(d.has("a")).toBe(false); // 0 == union.x
    expect(d.get("b")).toEqual({ x: -20, y: 0 });
    expect(d.get("c")).toEqual({ x: -80, y: 0 });
  });

  test("right → moving members get dx; already-aligned member omitted", () => {
    const d = compute_align_deltas(members, union, "right");
    expect(d.get("a")).toEqual({ x: 80, y: 0 });
    expect(d.get("b")).toEqual({ x: 30, y: 0 });
    expect(d.has("c")).toBe(false);
  });

  test("top → moving members get dy; already-aligned member omitted", () => {
    const d = compute_align_deltas(members, union, "top");
    expect(d.has("a")).toBe(false);
    expect(d.get("b")).toEqual({ x: 0, y: -30 });
    expect(d.get("c")).toEqual({ x: 0, y: -70 });
  });

  test("bottom → moving members get dy; already-aligned member omitted", () => {
    const d = compute_align_deltas(members, union, "bottom");
    expect(d.get("a")).toEqual({ x: 0, y: 65 });
    expect(d.get("b")).toEqual({ x: 0, y: 25 });
    expect(d.has("c")).toBe(false);
  });

  test("horizontal_centers → all center.x land at target center.x", () => {
    const d = compute_align_deltas(members, union, "horizontal_centers");
    expect(d.get("a")).toEqual({ x: 40, y: 0 });
    expect(d.get("b")).toEqual({ x: 5, y: 0 });
    expect(d.get("c")).toEqual({ x: -40, y: 0 });
  });

  test("vertical_centers → all center.y land at target center.y", () => {
    const d = compute_align_deltas(members, union, "vertical_centers");
    expect(d.get("a")?.y).toBeCloseTo(32.5);
    expect(d.get("b")?.y).toBeCloseTo(-2.5);
    expect(d.get("c")?.y).toBeCloseTo(-35);
    for (const m of members) expect(d.get(m.id)?.x).toBe(0);
  });

  test("empty members → empty result", () => {
    expect(compute_align_deltas([], union, "left").size).toBe(0);
  });
});

describe("compute_align_deltas — single against parent target", () => {
  // Caller would pass parent's bbox as `target` for single-selection align.
  const parent = { x: 0, y: 0, width: 100, height: 100 };

  test("single member aligns to target edges", () => {
    const member = { id: "x", bbox: { x: 40, y: 40, width: 20, height: 20 } };
    // align right: x = 100 - 20 = 80 → dx = 40
    expect(compute_align_deltas([member], parent, "right").get("x")).toEqual({
      x: 40,
      y: 0,
    });
    // align bottom: y = 100 - 20 = 80 → dy = 40
    expect(compute_align_deltas([member], parent, "bottom").get("x")).toEqual({
      x: 0,
      y: 40,
    });
    // horizontal_centers: center.x = 50; member center.x = 50; dx = 0 → omitted
    expect(
      compute_align_deltas([member], parent, "horizontal_centers").has("x")
    ).toBe(false);
  });
});
