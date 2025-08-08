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
    const cb: cmath.Vector2 = [50, 50];
    const seg0 = editor.segments[0];
    const frozen = {
      a: [...editor.vertices[seg0.a].p] as cmath.Vector2,
      b: [...editor.vertices[seg0.b].p] as cmath.Vector2,
      ta: [...seg0.ta] as cmath.Vector2,
      tb: [...seg0.tb] as cmath.Vector2,
    };
    const t0 = 0.5;
    // original point on curve
    const p1o = cmath.vector2.add(frozen.a, frozen.ta);
    const p2o = cmath.vector2.add(frozen.b, frozen.tb);
    const mt = 1 - t0;
    const mt2 = mt * mt;
    const t2 = t0 * t0;
    const p0o: cmath.Vector2 = [
      mt2 * mt * frozen.a[0] +
        3 * mt2 * t0 * p1o[0] +
        3 * mt * t2 * p2o[0] +
        t2 * t0 * frozen.b[0],
      mt2 * mt * frozen.a[1] +
        3 * mt2 * t0 * p1o[1] +
        3 * mt * t2 * p2o[1] +
        t2 * t0 * frozen.b[1],
    ];
    const delta: cmath.Vector2 = [cb[0] - p0o[0], cb[1] - p0o[1]];
    editor.bendSegment(0, t0, cb, frozen);
    const seg = editor.segments[0];
    expect(seg.ta[0]).toBeCloseTo(frozen.ta[0] + delta[0] * mt, 5);
    expect(seg.ta[1]).toBeCloseTo(frozen.ta[1] + delta[1] * mt, 5);
    expect(seg.tb[0]).toBeCloseTo(frozen.tb[0] + delta[0] * t0, 5);
    expect(seg.tb[1]).toBeCloseTo(frozen.tb[1] + delta[1] * t0, 5);
    const p0 = editor.vertices[seg.a].p;
    const p3 = editor.vertices[seg.b].p;
    const p1 = cmath.vector2.add(p0, seg.ta);
    const p2 = cmath.vector2.add(p3, seg.tb);
    const point = cubicAt(p0, p1, p2, p3, t0);
    expect(point[1]).toBeGreaterThan(p0o[1]);
  });

  it("preserves offset along the segment", () => {
    const net = vn.polyline([
      [0, 0],
      [100, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const cb: cmath.Vector2 = [40, 30];
    const seg0 = editor.segments[0];
    const frozen = {
      a: [...editor.vertices[seg0.a].p] as cmath.Vector2,
      b: [...editor.vertices[seg0.b].p] as cmath.Vector2,
      ta: [...seg0.ta] as cmath.Vector2,
      tb: [...seg0.tb] as cmath.Vector2,
    };
    const t0 = 0.25;
    const p1o = cmath.vector2.add(frozen.a, frozen.ta);
    const p2o = cmath.vector2.add(frozen.b, frozen.tb);
    const mt = 1 - t0;
    const mt2 = mt * mt;
    const t2 = t0 * t0;
    const p0o: cmath.Vector2 = [
      mt2 * mt * frozen.a[0] +
        3 * mt2 * t0 * p1o[0] +
        3 * mt * t2 * p2o[0] +
        t2 * t0 * frozen.b[0],
      mt2 * mt * frozen.a[1] +
        3 * mt2 * t0 * p1o[1] +
        3 * mt * t2 * p2o[1] +
        t2 * t0 * frozen.b[1],
    ];
    const delta: cmath.Vector2 = [cb[0] - p0o[0], cb[1] - p0o[1]];
    editor.bendSegment(0, t0, cb, frozen);
    const seg = editor.segments[0];
    expect(seg.ta[0]).toBeCloseTo(frozen.ta[0] + delta[0] * mt, 5);
    expect(seg.ta[1]).toBeCloseTo(frozen.ta[1] + delta[1] * mt, 5);
    expect(seg.tb[0]).toBeCloseTo(frozen.tb[0] + delta[0] * t0, 5);
    expect(seg.tb[1]).toBeCloseTo(frozen.tb[1] + delta[1] * t0, 5);
    const p0 = editor.vertices[seg.a].p;
    const p3 = editor.vertices[seg.b].p;
    const p1 = cmath.vector2.add(p0, seg.ta);
    const p2 = cmath.vector2.add(p3, seg.tb);
    const point = cubicAt(p0, p1, p2, p3, t0);
    const distBefore = Math.hypot(cb[0] - p0o[0], cb[1] - p0o[1]);
    const distAfter = Math.hypot(cb[0] - point[0], cb[1] - point[1]);
    expect(distAfter).toBeLessThan(distBefore);
  });
});
