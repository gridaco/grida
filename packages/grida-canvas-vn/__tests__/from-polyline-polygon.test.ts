import { vn } from "../vn";

describe("vn.fromPolyline", () => {
  it("two points => 2 vertices, 1 zero-tangent segment (line-equivalent)", () => {
    const net = vn.fromPolyline([
      [0, 0],
      [10, 20],
    ]);
    expect(net.vertices).toEqual([
      [0, 0],
      [10, 20],
    ]);
    expect(net.segments).toEqual([{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }]);
  });

  it("n points => n vertices, n-1 open segments", () => {
    const net = vn.fromPolyline([
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
    ]);
    expect(net.vertices).toHaveLength(4);
    expect(net.segments).toHaveLength(3);
    for (const s of net.segments) {
      expect(s.ta).toEqual([0, 0]);
      expect(s.tb).toEqual([0, 0]);
    }
    expect(net.segments.map((s) => [s.a, s.b])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it("single point => 1 vertex, 0 segments", () => {
    const net = vn.fromPolyline([[5, 5]]);
    expect(net.vertices).toEqual([[5, 5]]);
    expect(net.segments).toEqual([]);
  });

  it("empty input => empty network", () => {
    const net = vn.fromPolyline([]);
    expect(net.vertices).toEqual([]);
    expect(net.segments).toEqual([]);
  });

  it("copies vertex coordinates (does not retain caller references)", () => {
    const src: [number, number][] = [
      [1, 2],
      [3, 4],
    ];
    const net = vn.fromPolyline(src);
    src[0][0] = 999;
    expect(net.vertices[0][0]).toBe(1);
  });
});

describe("vn.fromPolygon", () => {
  it("n points => n vertices, n closed-chain segments", () => {
    const net = vn.fromPolygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(net.vertices).toHaveLength(4);
    expect(net.segments).toHaveLength(4);
    expect(net.segments.map((s) => [s.a, s.b])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ]);
    for (const s of net.segments) {
      expect(s.ta).toEqual([0, 0]);
      expect(s.tb).toEqual([0, 0]);
    }
  });

  it("two points => 2 vertices, 2 segments (open + close)", () => {
    const net = vn.fromPolygon([
      [0, 0],
      [10, 0],
    ]);
    expect(net.vertices).toHaveLength(2);
    expect(net.segments).toHaveLength(2);
    expect(net.segments.map((s) => [s.a, s.b])).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("single point => 1 vertex, 0 segments (no degenerate self-loop)", () => {
    const net = vn.fromPolygon([[5, 5]]);
    expect(net.vertices).toEqual([[5, 5]]);
    expect(net.segments).toEqual([]);
  });

  it("empty input => empty network", () => {
    const net = vn.fromPolygon([]);
    expect(net.vertices).toEqual([]);
    expect(net.segments).toEqual([]);
  });
});

describe("vn.polyline / vn.polygon — deprecated aliases", () => {
  it("polyline delegates to fromPolyline", () => {
    const a = vn.polyline([
      [0, 0],
      [1, 1],
    ]);
    const b = vn.fromPolyline([
      [0, 0],
      [1, 1],
    ]);
    expect(a).toEqual(b);
  });

  it("polygon delegates to fromPolygon", () => {
    const a = vn.polygon([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    const b = vn.fromPolygon([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(a).toEqual(b);
  });
});
