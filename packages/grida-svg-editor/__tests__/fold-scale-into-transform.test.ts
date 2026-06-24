// gridaco/grida#892 — `fold_scale_into_transform` folds the container's
// ancestor CSS scale into the camera-frame pixel-grid transform, so the grid
// stays aligned with content on the counter-scaled HUD canvas. The risk this
// guards is a transposition (scaling the wrong row / axis), so we assert the
// projected output of a known point, not just the matrix entries.
import { describe, it, expect } from "vitest";
import { fold_scale_into_transform } from "../src/dom";
import cmath from "@grida/cmath";

// out_x = t[0]·(x,y,1), out_y = t[1]·(x,y,1) — see `apply_camera_transform`.
const project = (t: cmath.Transform, p: cmath.Vector2): cmath.Vector2 =>
  cmath.vector2.transform(p, t);

describe("#892: fold_scale_into_transform", () => {
  it("returns the same transform at unit scale (no-op)", () => {
    const t: cmath.Transform = [
      [5, 0, 30],
      [0, 5, 40],
    ];
    expect(fold_scale_into_transform(t, 1, 1)).toBe(t);
  });

  it("scales the projected output per axis: out → (out_x·sx, out_y·sy)", () => {
    // Camera zoom 5×, pan (30,40): world (100,20) → (530, 140).
    const t: cmath.Transform = [
      [5, 0, 30],
      [0, 5, 40],
    ];
    const p: cmath.Vector2 = [100, 20];
    const base = project(t, p); // [530, 140]

    // Ancestor scale(0.5): the grid output must scale by 0.5 to match content
    // that the ancestor will render at half size.
    const folded = fold_scale_into_transform(t, 0.5, 0.5);
    const out = project(folded, p);
    expect(out[0]).toBeCloseTo(base[0] * 0.5, 6); // 265
    expect(out[1]).toBeCloseTo(base[1] * 0.5, 6); // 70
  });

  it("folds non-uniform scale on the correct axes (catches a row transposition)", () => {
    const t: cmath.Transform = [
      [2, 0, 10],
      [0, 3, 7],
    ];
    const p: cmath.Vector2 = [4, 6];
    const base = project(t, p); // [2*4+10, 3*6+7] = [18, 25]

    const folded = fold_scale_into_transform(t, 0.5, 0.25);
    const out = project(folded, p);
    expect(out[0]).toBeCloseTo(base[0] * 0.5, 6); // 9   (x by sx)
    expect(out[1]).toBeCloseTo(base[1] * 0.25, 6); // 6.25 (y by sy)
  });
});
