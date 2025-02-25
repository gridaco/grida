import { layout } from "../_layout";


describe("cmath.flex.autolayout", () => {
  it("handles single rectangle (fallback)", () => {
    const input = [{ x: 0, y: 0, width: 100, height: 100 }];
    const result = layout.flex.guess(input);
    expect(result.direction).toBe("horizontal");
    expect(result.spacing).toBe(0);
  });

  it("picks horizontal when width spread >= height spread", () => {
    const input = [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 60, y: 0, width: 50, height: 50 },
      { x: 120, y: 0, width: 50, height: 50 },
    ];
    const result = layout.flex.guess(input);
    expect(result.direction).toBe("horizontal");
    // gaps are 10 and 10
    expect(result.spacing).toBe(10);
  });

  it("picks vertical when height spread > width spread", () => {
    const input = [
      { x: 0, y: 0, width: 20, height: 50 },
      { x: 0, y: 60, width: 20, height: 50 },
      { x: 0, y: 120, width: 20, height: 50 },
    ];
    const result = layout.flex.guess(input);
    expect(result.direction).toBe("vertical");
    // gaps are 10 and 10
    expect(result.spacing).toBe(10);
  });

  it("overlapping and unaligned rectangles", () => {
    const input = [
      { x: 0, y: 0, width: 80, height: 100 },
      { x: 50, y: 30, width: 70, height: 60 }, // overlaps the first
      { x: 140, y: 20, width: 50, height: 40 }, // off to the side
      { x: 90, y: 10, width: 40, height: 80 }, // partial overlap
    ];
    const result = layout.flex.guess(input);
    expect(result.direction).toBeDefined();
    expect(result.spacing).toBeGreaterThanOrEqual(0);
  });
});
