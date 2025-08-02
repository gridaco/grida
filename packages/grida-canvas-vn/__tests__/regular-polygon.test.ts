import { vn } from "../vn";

describe("fromRegularPolygon", () => {
  it("creates closed polygon", () => {
    const result = vn.fromRegularPolygon({ x: 0, y: 0, width: 100, height: 100, points: 4 });
    const expected = [
      [50, 5],
      [95, 50],
      [50, 95],
      [5, 50],
    ];
    result.vertices.forEach((v, i) => {
      expect(v.p[0]).toBeCloseTo(expected[i][0]);
      expect(v.p[1]).toBeCloseTo(expected[i][1]);
    });
    expect(result.segments).toHaveLength(4);
    expect(result.segments[3]).toEqual({ a: 3, b: 0, ta: [0, 0], tb: [0, 0] });
  });
});

describe("fromRegularStarPolygon", () => {
  it("creates closed star polygon", () => {
    const result = vn.fromRegularStarPolygon({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      points: 5,
      innerRadius: 0.5,
    });
    expect(result.vertices).toHaveLength(10);
    expect(result.segments).toHaveLength(10);
    expect(result.segments[9]).toEqual({ a: 9, b: 0, ta: [0, 0], tb: [0, 0] });
  });
});
