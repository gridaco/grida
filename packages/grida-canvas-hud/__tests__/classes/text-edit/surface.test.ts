// Tests for the text-edit named-class builder.
//
// Pins:
//   - Caret thickness is zoom-invariant (constant screen px) while its
//     length tracks the projected glyph height.
//   - Caret anchor + angle follow the local→world transform (rotated text).
//   - Selection rects project to closed, translucent doc-space polygons.
//   - Caret is suppressed when not visible / absent (blink + read-only).
//   - Semantic group propagates to every emitted primitive.

import { describe, it, expect } from "vitest";
import cmath from "@grida/cmath";
import {
  buildTextEditChrome,
  DEFAULT_CARET_SCREEN_WIDTH,
  type TextEditCaret,
} from "../../../classes/text-edit";

const IDENTITY = cmath.transform.identity;
const CARET: TextEditCaret = { top: [10, 0], bottom: [10, 20] };

describe("buildTextEditChrome — caret", () => {
  it("width is constant across zoom; length tracks the projected height", () => {
    const chrome = { transform: IDENTITY, caret: CARET, caretVisible: true };
    const r1 = buildTextEditChrome({ chrome, camera: IDENTITY });
    const r4 = buildTextEditChrome({
      chrome,
      camera: cmath.transform.scale(IDENTITY, 4, [0, 0]),
    });

    expect(r1.screenRects).toHaveLength(1);
    expect(r4.screenRects).toHaveLength(1);
    // Width never multiplies by zoom — it is a literal screen-px constant.
    expect(r1.screenRects[0].width).toBe(DEFAULT_CARET_SCREEN_WIDTH);
    expect(r4.screenRects[0].width).toBe(DEFAULT_CARET_SCREEN_WIDTH);
    // Height (projected length) does scale with zoom.
    expect(r1.screenRects[0].height).toBeCloseTo(20, 5);
    expect(r4.screenRects[0].height).toBeCloseTo(80, 5);
  });

  it("anchor + angle track a rotation transform (rotated text)", () => {
    const rot = cmath.transform.rotate(IDENTITY, 90, [0, 0]); // local → world
    const r = buildTextEditChrome({
      chrome: { transform: rot, caret: CARET, caretVisible: true },
      camera: IDENTITY,
    });

    // Anchor is the projected caret midpoint.
    const mid: cmath.Vector2 = [10, 10];
    const expected = cmath.vector2.transform(mid, rot);
    expect(r.screenRects[0].x).toBeCloseTo(expected[0], 5);
    expect(r.screenRects[0].y).toBeCloseTo(expected[1], 5);
    // Caret rotates 90° with the text (angle stored in radians).
    expect(Math.abs(r.screenRects[0].angle ?? 0)).toBeCloseTo(Math.PI / 2, 5);
    // Rotation preserves length.
    expect(r.screenRects[0].height).toBeCloseTo(20, 5);
  });

  it("angle follows the projected segment under shear (not the matrix x-axis)", () => {
    // skewX: x' = x + 0.5y. The matrix x-axis angle is 0, but a vertical caret
    // segment tilts — the angle must track the segment, not the matrix.
    const shear: cmath.Transform = [
      [1, 0.5, 0],
      [0, 1, 0],
    ];
    const r = buildTextEditChrome({
      chrome: { transform: shear, caret: CARET, caretVisible: true },
      camera: IDENTITY,
    });
    const t = cmath.vector2.transform(CARET.top, shear);
    const b = cmath.vector2.transform(CARET.bottom, shear);
    const expected = Math.atan2(b[1] - t[1], b[0] - t[0]) - Math.PI / 2;
    expect(r.screenRects[0].angle).toBeCloseTo(expected, 5);
    // Not zero — the matrix x-axis angle (atan2(b, a) = 0) would be wrong here.
    expect(Math.abs(r.screenRects[0].angle ?? 0)).toBeGreaterThan(0.05);
  });

  it("is suppressed when not visible or absent", () => {
    const hidden = buildTextEditChrome({
      chrome: { transform: IDENTITY, caret: CARET, caretVisible: false },
      camera: IDENTITY,
    });
    expect(hidden.screenRects).toHaveLength(0);

    const absent = buildTextEditChrome({
      chrome: {
        transform: IDENTITY,
        selectionRects: [{ x: 0, y: 0, width: 10, height: 10 }],
      },
      camera: IDENTITY,
    });
    expect(absent.screenRects).toHaveLength(0);
  });
});

describe("buildTextEditChrome — selection", () => {
  it("projects each rect to a closed translucent polygon", () => {
    // local → world: scale 2 + translate (5, 7), as a full affine.
    const transform: cmath.Transform = [
      [2, 0, 5],
      [0, 2, 7],
    ];
    const r = buildTextEditChrome({
      chrome: {
        transform,
        selectionRects: [{ x: 0, y: 0, width: 100, height: 20 }],
      },
      camera: IDENTITY,
    });

    expect(r.polylines).toHaveLength(1);
    const pl = r.polylines[0];
    expect(pl.points).toHaveLength(5); // 4 corners + closing point
    expect(pl.points[0]).toEqual(pl.points[4]); // closed
    expect(pl.stroke).toBe(false);
    expect(pl.fill).toBe(true);
    expect(pl.fillPaint).toEqual({
      kind: "solid",
      color: "#2563eb",
      opacity: 0.25,
    });
    // Top-left corner is the projected (0,0).
    const tl = cmath.vector2.transform([0, 0], transform);
    expect(pl.points[0][0]).toBeCloseTo(tl[0], 5);
    expect(pl.points[0][1]).toBeCloseTo(tl[1], 5);
  });
});

describe("buildTextEditChrome — group", () => {
  it("propagates the semantic group to caret + selection", () => {
    const r = buildTextEditChrome({
      chrome: {
        transform: IDENTITY,
        caret: CARET,
        caretVisible: true,
        selectionRects: [{ x: 0, y: 0, width: 10, height: 10 }],
        group: "text-edit",
      },
      camera: IDENTITY,
    });
    expect(r.screenRects[0].group).toBe("text-edit");
    expect(r.polylines[0].group).toBe("text-edit");
  });
});
