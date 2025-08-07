import { vn } from "../vn";
import cmath from "@grida/cmath";

function cubicAt(p0: cmath.Vector2, p1: cmath.Vector2, p2: cmath.Vector2, p3: cmath.Vector2, t: number): cmath.Vector2 {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const c = 3 * s * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

describe("bendSegment", () => {
  it("bends a middle point toward a target", () => {
    const net = vn.polyline([
      [0, 0],
      [100, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const ca: cmath.Vector2 = [50, 0];
    const cb: cmath.Vector2 = [50, 50];
    editor.bendSegment(0, ca, cb);

    const seg = editor.segments[0];
    const p0 = editor.vertices[seg.a].p;
    const p3 = editor.vertices[seg.b].p;
    const p1 = cmath.vector2.add(p0, seg.ta);
    const p2 = cmath.vector2.add(p3, seg.tb);
    const point = cubicAt(p0, p1, p2, p3, 0.5);
    expect(point[0]).toBeCloseTo(50, 5);
    expect(point[1]).toBeCloseTo(50, 5);
  });

  it("preserves offset along the segment", () => {
    const net = vn.polyline([
      [0, 0],
      [100, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const ca: cmath.Vector2 = [25, 0];
    const cb: cmath.Vector2 = [40, 30];
    editor.bendSegment(0, ca, cb);

    const seg = editor.segments[0];
    const p0 = editor.vertices[seg.a].p;
    const p3 = editor.vertices[seg.b].p;
    const p1 = cmath.vector2.add(p0, seg.ta);
    const p2 = cmath.vector2.add(p3, seg.tb);
    const point = cubicAt(p0, p1, p2, p3, 0.25);
    expect(point[0]).toBeCloseTo(40, 5);
    expect(point[1]).toBeCloseTo(30, 5);
  });
});
