import { describe, expect, it } from "vitest";
import {
  autoScrollDelta,
  desiredDepthFromX,
  passedDragThreshold,
  placementFromY,
  snapToEdge,
} from "..";

describe("placementFromY", () => {
  it("top third is 'before'", () => {
    expect(placementFromY(2, 30)).toBe("before");
    expect(placementFromY(9, 30)).toBe("before");
  });
  it("middle third is 'into'", () => {
    expect(placementFromY(15, 30)).toBe("into");
  });
  it("bottom third is 'after'", () => {
    expect(placementFromY(28, 30)).toBe("after");
  });
  it("degenerate zero-height returns 'into'", () => {
    expect(placementFromY(0, 0)).toBe("into");
  });
});

describe("desiredDepthFromX", () => {
  it("computes depth from cursor x (default 4px base, 12px step)", () => {
    // x at the start of depth-0 indent → 0
    expect(desiredDepthFromX(5, 4, 12, 4)).toBe(0);
    // x past one step → 1
    expect(desiredDepthFromX(18, 4, 12, 4)).toBe(1);
    // x past two steps → 2
    expect(desiredDepthFromX(30, 4, 12, 4)).toBe(2);
  });
  it("clamps below to 0", () => {
    expect(desiredDepthFromX(-50, 4, 12, 4)).toBe(0);
    expect(desiredDepthFromX(0, 4, 12, 4)).toBe(0);
  });
  it("clamps above to rowDepth", () => {
    expect(desiredDepthFromX(500, 4, 12, 2)).toBe(2);
  });
  it("degenerate zero step returns 0", () => {
    expect(desiredDepthFromX(100, 0, 0, 5)).toBe(0);
  });
});

describe("passedDragThreshold", () => {
  it("returns false within threshold (L2 distance)", () => {
    expect(passedDragThreshold(0, 0, 2, 2, 4)).toBe(false); // sqrt(8) ≈ 2.83 < 4
  });
  it("returns true on or past threshold", () => {
    expect(passedDragThreshold(0, 0, 4, 0, 4)).toBe(true);
    expect(passedDragThreshold(0, 0, 3, 3, 4)).toBe(true); // sqrt(18) ≈ 4.24 > 4
  });
  it("treats zero threshold as always-passed when moved at all", () => {
    expect(passedDragThreshold(0, 0, 0, 0, 0)).toBe(true);
    expect(passedDragThreshold(0, 0, 1, 0, 0)).toBe(true);
  });
});

describe("autoScrollDelta", () => {
  it("returns 0 inside the comfort zone", () => {
    // container 100..500, y=300 (well inside), edge=32
    expect(autoScrollDelta(100, 500, 300)).toBe(0);
  });
  it("returns negative (scroll up) near the top edge", () => {
    // y = top + 10 (well inside the 32px edge zone) → t = (32 - 10) / 32 ≈ 0.69
    const d = autoScrollDelta(100, 500, 110, 32, 16);
    expect(d).toBeLessThan(0);
    expect(d).toBeGreaterThanOrEqual(-16);
  });
  it("returns positive (scroll down) near the bottom edge", () => {
    const d = autoScrollDelta(100, 500, 490, 32, 16);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(16);
  });
  it("respects min magnitude of 2 even on slight edge overlap", () => {
    // y = bottom - edge + 0.5 → tiny overlap, magnitude clamped to 2
    const d = autoScrollDelta(100, 500, 500 - 32 + 0.5, 32, 16);
    expect(Math.abs(d)).toBeGreaterThanOrEqual(2);
  });
  it("caps at maxSpeed when far past the edge", () => {
    const d = autoScrollDelta(100, 500, 600, 32, 16);
    expect(d).toBe(16);
  });
  it("degenerate zero edge returns 0", () => {
    expect(autoScrollDelta(100, 500, 110, 0, 16)).toBe(0);
  });
});

describe("snapToEdge", () => {
  it("returns 'before-first' when y is above firstTop", () => {
    expect(snapToEdge(50, 100, 500)).toBe("before-first");
  });
  it("returns 'after-last' when y is below lastBottom", () => {
    expect(snapToEdge(600, 100, 500)).toBe("after-last");
  });
  it("returns null when y is inside the rows' band", () => {
    expect(snapToEdge(300, 100, 500)).toBeNull();
  });
});
