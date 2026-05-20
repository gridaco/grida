import { describe, expect, it } from "vitest";
import { project_local_bbox } from "../src/core/transform/project";
import type { Rect } from "../src/types";

const SQRT_HALF = Math.SQRT2 / 2; // cos(45°) = sin(45°)

describe("project_local_bbox", () => {
  it("returns input unchanged when transform is null / empty / identity", () => {
    const r: Rect = { x: 10, y: 20, width: 30, height: 40 };
    expect(project_local_bbox(r, null)).toEqual(r);
    expect(project_local_bbox(r, "")).toEqual(r);
    expect(project_local_bbox(r, "none")).toEqual(r);
  });

  it("applies a leading translate", () => {
    const r: Rect = { x: 0, y: 0, width: 50, height: 60 };
    expect(project_local_bbox(r, "translate(100 200)")).toEqual({
      x: 100,
      y: 200,
      width: 50,
      height: 60,
    });
  });

  it("rotates a 100×100 rect 45° around its own center: doc-space AABB grows to √2·100", () => {
    // Square at origin, pivot at its center.
    const r: Rect = { x: 0, y: 0, width: 100, height: 100 };
    const out = project_local_bbox(r, "rotate(45 50 50)");
    // Visible diagonal is along the axes after a 45° rotation. AABB
    // corners: top at (50, 50 - 50√2), bottom at (50, 50 + 50√2), etc.
    const diag = 100 * SQRT_HALF * 2; // = 100√2 ≈ 141.42
    expect(out.width).toBeCloseTo(diag, 4);
    expect(out.height).toBeCloseTo(diag, 4);
    expect(out.x).toBeCloseTo(50 - diag / 2, 4);
    expect(out.y).toBeCloseTo(50 - diag / 2, 4);
  });

  it("rotates 90° around origin: (10,20,30,40) → (-60,10,40,30)", () => {
    const r: Rect = { x: 10, y: 20, width: 30, height: 40 };
    const out = project_local_bbox(r, "rotate(90 0 0)");
    // Corner mapping under R(90°): (x, y) → (-y, x). Local corners:
    //   (10, 20) → (-20, 10)
    //   (40, 20) → (-20, 40)
    //   (40, 60) → (-60, 40)
    //   (10, 60) → (-60, 10)
    // AABB: x ∈ [-60, -20], y ∈ [10, 40]. width = 40, height = 30.
    expect(out.x).toBeCloseTo(-60, 4);
    expect(out.y).toBeCloseTo(10, 4);
    expect(out.width).toBeCloseTo(40, 4);
    expect(out.height).toBeCloseTo(30, 4);
  });

  it("composes translate then rotate in source order (A·B·p — B first)", () => {
    // transform="translate(10 0) rotate(90 0 0)" — rotate is applied
    // FIRST to the local point, then translate.
    // Local (1, 0) → rotate → (0, 1) → translate(10, 0) → (10, 1).
    const r: Rect = { x: 1, y: 0, width: 0, height: 0 };
    const out = project_local_bbox(r, "translate(10 0) rotate(90 0 0)");
    expect(out.x).toBeCloseTo(10, 4);
    expect(out.y).toBeCloseTo(1, 4);
  });

  it("falls through unparseable transform without throwing", () => {
    const r: Rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(project_local_bbox(r, "foo(1)")).toEqual(r);
    expect(project_local_bbox(r, "rotate()")).toEqual(r);
  });

  it("matrix(a b c d e f) projects directly", () => {
    const r: Rect = { x: 0, y: 0, width: 10, height: 10 };
    // matrix(1 0 0 1 5 7) ≡ translate(5 7).
    expect(project_local_bbox(r, "matrix(1 0 0 1 5 7)")).toEqual({
      x: 5,
      y: 7,
      width: 10,
      height: 10,
    });
  });

  it("matches the FEEDBACK fixture: a 100×100 rotated 45° around its center", () => {
    // This is the exact fixture the snap reproduction test uses. The
    // projection helper should produce the same numbers the helper in
    // `snap-rotated-aabb-leak.test.ts` computes by hand.
    const local: Rect = { x: 0, y: 0, width: 100, height: 100 };
    const out = project_local_bbox(local, "rotate(45 50 50)");
    expect(out.x).toBeCloseTo(-20.7107, 3);
    expect(out.y).toBeCloseTo(-20.7107, 3);
    expect(out.x + out.width).toBeCloseTo(120.7107, 3);
    expect(out.y + out.height).toBeCloseTo(120.7107, 3);
  });
});
