import cmath from "..";

describe("cmath.polyline.point_distance", () => {
  test("empty polyline returns Infinity", () => {
    expect(cmath.polyline.point_distance([5, 5], [], false)).toBe(Infinity);
  });

  test("single-point polyline is point-to-point distance", () => {
    expect(cmath.polyline.point_distance([3, 4], [[0, 0]], false)).toBeCloseTo(
      5
    );
  });

  test("open chain — distance to nearest edge", () => {
    // L-shape: (0,0) → (10,0) → (10,10). Point (5, 3) — above first edge.
    const pts: cmath.Vector2[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    expect(cmath.polyline.point_distance([5, 3], pts, false)).toBeCloseTo(3);
  });

  test("open chain — does not include closing edge", () => {
    // Triangle vertices, open form: (0,0)→(10,0)→(5,10). The closing
    // edge would be (5,10)→(0,0); a point near that edge but far from
    // the two open edges should return that far distance.
    const pts: cmath.Vector2[] = [
      [0, 0],
      [10, 0],
      [5, 10],
    ];
    // Point (2, 4): near the closing edge (0,0)-(5,10) (which the open
    // form ignores). Distance to edge (0,0)-(10,0) is 4; to (10,0)-(5,10)
    // is larger. Open form returns 4.
    expect(cmath.polyline.point_distance([2, 4], pts, false)).toBeCloseTo(4);
  });

  test("closed ring — includes last→first edge", () => {
    // Same triangle, closed. The closing edge (5,10)→(0,0) passes near
    // (2,4): line from (0,0) to (5,10), point (2,4). Projection
    // t = (2*5 + 4*10) / (25 + 100) = 50/125 = 0.4 → foot (2, 4) is on
    // the line — distance 0.
    const pts: cmath.Vector2[] = [
      [0, 0],
      [10, 0],
      [5, 10],
    ];
    expect(cmath.polyline.point_distance([2, 4], pts, true)).toBeCloseTo(0);
  });

  test("point inside a closed ring returns distance to nearest edge, not 0", () => {
    // Square (0,0)-(10,0)-(10,10)-(0,10), closed. Point (5,5) is dead
    // center — distance to nearest edge is 5.
    const pts: cmath.Vector2[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(cmath.polyline.point_distance([5, 5], pts, true)).toBeCloseTo(5);
  });
});
