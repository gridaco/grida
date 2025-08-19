import cmath from "..";

describe("cmath.polygon.pointInPolygon", () => {
  const square: cmath.Vector2[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it("detects point inside", () => {
    expect(cmath.polygon.pointInPolygon([5, 5], square)).toBe(true);
  });

  it("detects point outside", () => {
    expect(cmath.polygon.pointInPolygon([-1, 5], square)).toBe(false);
  });

  it("treats boundary points as inside", () => {
    expect(cmath.polygon.pointInPolygon([0, 5], square)).toBe(true);
    expect(cmath.polygon.pointInPolygon([0, 0], square)).toBe(true);
  });
});
