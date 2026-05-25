import cmath from "..";

// Each case names the rule in plain language — the test name IS the spec.
// If a case flips, `git grep` over the direction name surfaces the test.
//
// Pinned against the production aspect-ratio guide table at
// editor/grida-canvas-react/viewport/ui/aspect-ratio-guide.tsx:16-57.
// If the production table is updated, the diff lands here too.

describe("cmath.ui.diagonalForDirection", () => {
  // 10×6 rect at (0, 0). Corners:
  //   TL = [0, 0]   TR = [10, 0]
  //   BL = [0, 6]   BR = [10, 6]
  const rect: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 6 };

  it("'ne' spans BL → TR (opposite-corner to dragged-corner)", () => {
    expect(cmath.ui.diagonalForDirection(rect, "ne")).toEqual({
      x1: 0,
      y1: 6,
      x2: 10,
      y2: 0,
    });
  });

  it("'se' spans TL → BR (opposite-corner to dragged-corner)", () => {
    expect(cmath.ui.diagonalForDirection(rect, "se")).toEqual({
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 6,
    });
  });

  it("'nw' spans BR → TL (opposite-corner to dragged-corner)", () => {
    expect(cmath.ui.diagonalForDirection(rect, "nw")).toEqual({
      x1: 10,
      y1: 6,
      x2: 0,
      y2: 0,
    });
  });

  it("'sw' spans TR → BL (opposite-corner to dragged-corner)", () => {
    expect(cmath.ui.diagonalForDirection(rect, "sw")).toEqual({
      x1: 10,
      y1: 0,
      x2: 0,
      y2: 6,
    });
  });

  it("'n' edge resolves to BL → TR (same diagonal as 'ne')", () => {
    expect(cmath.ui.diagonalForDirection(rect, "n")).toEqual({
      x1: 0,
      y1: 6,
      x2: 10,
      y2: 0,
    });
  });

  it("'s' edge resolves to TL → BR (same diagonal as 'se')", () => {
    expect(cmath.ui.diagonalForDirection(rect, "s")).toEqual({
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 6,
    });
  });

  it("'e' edge resolves to TL → BR (same diagonal as 'se')", () => {
    expect(cmath.ui.diagonalForDirection(rect, "e")).toEqual({
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 6,
    });
  });

  it("'w' edge resolves to TR → BL (same diagonal as 'sw')", () => {
    expect(cmath.ui.diagonalForDirection(rect, "w")).toEqual({
      x1: 10,
      y1: 0,
      x2: 0,
      y2: 6,
    });
  });

  it("honors a non-origin rect translation", () => {
    const translated: cmath.Rectangle = { x: 100, y: 50, width: 10, height: 6 };
    expect(cmath.ui.diagonalForDirection(translated, "se")).toEqual({
      x1: 100,
      y1: 50,
      x2: 110,
      y2: 56,
    });
  });

  it("returns a zero-length line for a degenerate (0×0) rect at origin", () => {
    // No null-or-throw — production's `<AspectRatioGuide>` early-returns
    // when `width <= 0 || height <= 0`; the geometry helper stays total
    // and lets the host decide whether to draw.
    const degenerate: cmath.Rectangle = { x: 0, y: 0, width: 0, height: 0 };
    expect(cmath.ui.diagonalForDirection(degenerate, "se")).toEqual({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
    });
  });
});
