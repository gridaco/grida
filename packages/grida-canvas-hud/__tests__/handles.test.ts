import { describe, it, expect } from "vitest";
import {
  resizeHandlesAt,
  rotationHandlesAt,
  handlesVisible,
  hitResizeHandle,
  hitRotationHandle,
  MIN_HANDLES_VISIBLE_SIZE,
  ROTATION_OFFSET,
} from "../event/handles";

describe("handles", () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 };

  it("resize handles at 8 positions", () => {
    const h = resizeHandlesAt(rect);
    expect(h.nw).toEqual({ x: 100, y: 100 });
    expect(h.ne).toEqual({ x: 300, y: 100 });
    expect(h.se).toEqual({ x: 300, y: 200 });
    expect(h.sw).toEqual({ x: 100, y: 200 });
    expect(h.n).toEqual({ x: 200, y: 100 });
    expect(h.e).toEqual({ x: 300, y: 150 });
    expect(h.s).toEqual({ x: 200, y: 200 });
    expect(h.w).toEqual({ x: 100, y: 150 });
  });

  it("rotation handles sit outside corners", () => {
    const r = rotationHandlesAt(rect);
    expect(r.nw).toEqual({
      x: 100 - ROTATION_OFFSET,
      y: 100 - ROTATION_OFFSET,
    });
    expect(r.se).toEqual({
      x: 300 + ROTATION_OFFSET,
      y: 200 + ROTATION_OFFSET,
    });
  });

  it("visibility threshold", () => {
    expect(handlesVisible({ x: 0, y: 0, width: 50, height: 50 })).toBe(true);
    expect(
      handlesVisible({ x: 0, y: 0, width: MIN_HANDLES_VISIBLE_SIZE, height: 4 })
    ).toBe(true);
    expect(handlesVisible({ x: 0, y: 0, width: 4, height: 4 })).toBe(false);
  });

  it("hit-test corner handles wins over edge midpoints", () => {
    // NE handle is at (300, 100); a point clearly on NE.
    expect(hitResizeHandle(rect, [300, 100])).toBe("ne");
    // NW handle.
    expect(hitResizeHandle(rect, [100, 100])).toBe("nw");
    // North edge midpoint (200, 100) should be N.
    expect(hitResizeHandle(rect, [200, 100])).toBe("n");
    // Off all handles.
    expect(hitResizeHandle(rect, [200, 150])).toBeNull();
  });

  it("hit-test rotation handles by radius", () => {
    expect(
      hitRotationHandle(rect, [100 - ROTATION_OFFSET, 100 - ROTATION_OFFSET])
    ).toBe("nw");
    // Far from any rotation handle.
    expect(hitRotationHandle(rect, [200, 150])).toBeNull();
  });
});
