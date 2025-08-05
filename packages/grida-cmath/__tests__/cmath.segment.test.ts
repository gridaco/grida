import cmath from "..";

describe("cmath.segment.orientation", () => {
  test("returns positive for counter-clockwise orientation", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [1, 0];
    const c: cmath.Vector2 = [0, 1];
    expect(cmath.segment.orientation(a, b, c)).toBeGreaterThan(0);
  });

  test("returns negative for clockwise orientation", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [0, 1];
    const c: cmath.Vector2 = [1, 0];
    expect(cmath.segment.orientation(a, b, c)).toBeLessThan(0);
  });

  test("returns zero for collinear points", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [1, 1];
    const c: cmath.Vector2 = [2, 2];
    expect(cmath.segment.orientation(a, b, c)).toBe(0);
  });
});

describe("cmath.segment.onSegment", () => {
  test("returns true when point lies on segment", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [10, 0];
    const c: cmath.Vector2 = [5, 0];
    expect(cmath.segment.onSegment(a, c, b)).toBe(true);
  });

  test("returns false when point is outside the segment", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [10, 0];
    const c: cmath.Vector2 = [15, 0];
    expect(cmath.segment.onSegment(a, c, b)).toBe(false);
  });
});

describe("cmath.segment.intersects", () => {
  test("detects crossing segments", () => {
    const p1: cmath.Vector2 = [0, 0];
    const p2: cmath.Vector2 = [10, 10];
    const q1: cmath.Vector2 = [0, 10];
    const q2: cmath.Vector2 = [10, 0];
    expect(cmath.segment.intersects(p1, p2, q1, q2)).toBe(true);
  });

  test("detects non-intersecting parallel segments", () => {
    const p1: cmath.Vector2 = [0, 0];
    const p2: cmath.Vector2 = [10, 0];
    const q1: cmath.Vector2 = [0, 1];
    const q2: cmath.Vector2 = [10, 1];
    expect(cmath.segment.intersects(p1, p2, q1, q2)).toBe(false);
  });

  test("detects overlapping collinear segments", () => {
    const p1: cmath.Vector2 = [0, 0];
    const p2: cmath.Vector2 = [10, 0];
    const q1: cmath.Vector2 = [5, 0];
    const q2: cmath.Vector2 = [15, 0];
    expect(cmath.segment.intersects(p1, p2, q1, q2)).toBe(true);
  });
});

describe("cmath.segment.intersectsRect", () => {
  const rect: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };

  test("returns true when segment crosses the rectangle", () => {
    const p0: cmath.Vector2 = [-5, 5];
    const p1: cmath.Vector2 = [15, 5];
    expect(cmath.segment.intersectsRect(p0, p1, rect)).toBe(true);
  });

  test("returns true when segment is inside the rectangle", () => {
    const p0: cmath.Vector2 = [1, 1];
    const p1: cmath.Vector2 = [9, 9];
    expect(cmath.segment.intersectsRect(p0, p1, rect)).toBe(true);
  });

  test("returns false when segment is outside the rectangle", () => {
    const p0: cmath.Vector2 = [-5, -5];
    const p1: cmath.Vector2 = [-1, -1];
    expect(cmath.segment.intersectsRect(p0, p1, rect)).toBe(false);
  });
});
