// Aspect-ratio guide — the diagonal dashed line drawn across the resize
// preview box while Shift aspect-locks the gesture. Mirrors the main editor's
// `AspectRatioGuide`; geometry comes from `cmath.ui.diagonalForDirection`
// (the corner opposite the dragged handle). Lives in `decoration.lines`,
// alongside the dashed preview rect/polyline.

import { describe, it, expect } from "vitest";
import cmath from "@grida/cmath";
import { SurfaceState } from "../event/state";
import { buildChrome } from "../surface/chrome";
import { DEFAULT_STYLE } from "../surface/style";
import type { NodeId, Rect } from "../event/gesture";
import type { SelectionShape, ResizeDirection } from "../event";

const IDENTITY_CAMERA: cmath.Transform = [
  [1, 0, 0],
  [0, 1, 0],
];

function resizeChrome(
  shape: SelectionShape,
  direction: ResizeDirection,
  opts: { shift: boolean }
) {
  const state = new SurfaceState();
  state.setSelection(["a"]);
  state.setTransform(IDENTITY_CAMERA);
  state.modifiers.shift = opts.shift;
  state.gesture = {
    kind: "resize",
    ids: ["a"],
    direction,
    initial_shape: shape,
    anchor_doc: [0, 0],
    last_doc: [0, 0],
    current_shape: shape,
    preview_shape: shape,
  };
  const shapeOf = (_: NodeId): SelectionShape | null => null;
  const { decoration } = buildChrome({
    state,
    shapeOf,
    style: DEFAULT_STYLE,
    width: 1000,
    height: 1000,
  });
  return decoration;
}

const RECT: Rect = { x: 0, y: 0, width: 100, height: 50 };

describe("aspect-ratio guide — Shift draws the diagonal of the preview box", () => {
  it("is absent without Shift", () => {
    const decoration = resizeChrome({ kind: "rect", rect: RECT }, "se", {
      shift: false,
    });
    expect(decoration.lines ?? []).toHaveLength(0);
  });

  it("'se' draws TL→BR (the corner opposite the dragged handle)", () => {
    const decoration = resizeChrome({ kind: "rect", rect: RECT }, "se", {
      shift: true,
    });
    const lines = decoration.lines ?? [];
    expect(lines).toHaveLength(1);
    const l = lines[0];
    expect(l.dashed).toBe(true);
    // toCorners = [TL, TR, BR, BL]; "se" → TL→BR.
    expect([l.x1, l.y1]).toEqual([0, 0]);
    expect([l.x2, l.y2]).toEqual([100, 50]);
  });

  it("'e' edge uses the same SE diagonal (TL→BR)", () => {
    const decoration = resizeChrome({ kind: "rect", rect: RECT }, "e", {
      shift: true,
    });
    const l = (decoration.lines ?? [])[0];
    expect([l.x1, l.y1, l.x2, l.y2]).toEqual([0, 0, 100, 50]);
  });

  it("'ne' draws BL→TR", () => {
    const decoration = resizeChrome({ kind: "rect", rect: RECT }, "ne", {
      shift: true,
    });
    const l = (decoration.lines ?? [])[0];
    // "ne" → BL(0,50) → TR(100,0).
    expect([l.x1, l.y1, l.x2, l.y2]).toEqual([0, 50, 100, 0]);
  });

  it("transformed shape: the diagonal is projected through the matrix", () => {
    const local: Rect = { x: 0, y: 0, width: 100, height: 100 };
    const matrix = cmath.transform.rotate(
      cmath.transform.identity,
      30,
      [50, 50]
    );
    const decoration = resizeChrome(
      { kind: "transformed", local, matrix },
      "se",
      { shift: true }
    );
    const l = (decoration.lines ?? [])[0];
    expect(l.dashed).toBe(true);
    // "se" → local TL(0,0) → BR(100,100), each projected by the matrix.
    const [ex1, ey1] = cmath.vector2.transform([0, 0], matrix);
    const [ex2, ey2] = cmath.vector2.transform([100, 100], matrix);
    expect(l.x1).toBeCloseTo(ex1, 9);
    expect(l.y1).toBeCloseTo(ey1, 9);
    expect(l.x2).toBeCloseTo(ex2, 9);
    expect(l.y2).toBeCloseTo(ey2, 9);
  });

  it("coexists with the dashed preview rect (both are emitted)", () => {
    const decoration = resizeChrome({ kind: "rect", rect: RECT }, "se", {
      shift: true,
    });
    expect((decoration.rects ?? []).filter((r) => r.dashed)).toHaveLength(1);
    expect(decoration.lines ?? []).toHaveLength(1);
  });
});
