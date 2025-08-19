import { vn } from "../vn";
import cmath from "@grida/cmath";

function cubicAt(
  p0: cmath.Vector2,
  p1: cmath.Vector2,
  p2: cmath.Vector2,
  p3: cmath.Vector2,
  t: number
): cmath.Vector2 {
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
      a: editor.vertices[seg0.a] as cmath.Vector2,
      b: editor.vertices[seg0.b] as cmath.Vector2,
      ta: seg0.ta as cmath.Vector2,
      tb: seg0.tb as cmath.Vector2,
    };
    const t0 = 0.5;

    // Get the original point on the curve
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

    editor.bendSegment(0, t0, cb, frozen);

    const seg = editor.segments[0];
    const p0 = editor.vertices[seg.a];
    const p3 = editor.vertices[seg.b];
    const p1 = cmath.vector2.add(p0, seg.ta);
    const p2 = cmath.vector2.add(p3, seg.tb);

    // Check that the curve passes through the target point
    const point = cubicAt(p0, p1, p2, p3, t0);
    const distance = Math.hypot(cb[0] - point[0], cb[1] - point[1]);
    expect(distance).toBeLessThan(0.1);

    // Check that the curve has been bent upward (y coordinate increased)
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
      a: editor.vertices[seg0.a] as cmath.Vector2,
      b: editor.vertices[seg0.b] as cmath.Vector2,
      ta: seg0.ta as cmath.Vector2,
      tb: seg0.tb as cmath.Vector2,
    };
    const t0 = 0.25;

    // Get the original point on the curve
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

    editor.bendSegment(0, t0, cb, frozen);

    const seg = editor.segments[0];
    const p0 = editor.vertices[seg.a];
    const p3 = editor.vertices[seg.b];
    const p1 = cmath.vector2.add(p0, seg.ta);
    const p2 = cmath.vector2.add(p3, seg.tb);

    // Check that the curve passes through the target point
    const point = cubicAt(p0, p1, p2, p3, t0);
    const distance = Math.hypot(cb[0] - point[0], cb[1] - point[1]);
    expect(distance).toBeLessThan(0.1);

    // Check that the distance to the target has been reduced
    const distBefore = Math.hypot(cb[0] - p0o[0], cb[1] - p0o[1]);
    const distAfter = Math.hypot(cb[0] - point[0], cb[1] - point[1]);
    expect(distAfter).toBeLessThan(distBefore);
  });

  it("correctly makes curve pass through target point", () => {
    const net = vn.polyline([
      [0, 0],
      [100, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const cb: cmath.Vector2 = [50, 50];
    const seg0 = editor.segments[0];
    const frozen = {
      a: editor.vertices[seg0.a] as cmath.Vector2,
      b: editor.vertices[seg0.b] as cmath.Vector2,
      ta: seg0.ta as cmath.Vector2,
      tb: seg0.tb as cmath.Vector2,
    };
    const t0 = 0.5;

    editor.bendSegment(0, t0, cb, frozen);

    const seg = editor.segments[0];
    const p0 = editor.vertices[seg.a];
    const p3 = editor.vertices[seg.b];
    const p1 = cmath.vector2.add(p0, seg.ta);
    const p2 = cmath.vector2.add(p3, seg.tb);

    // Check that the curve passes through the target point at the specified parametric position
    const point = cubicAt(p0, p1, p2, p3, t0);
    const distance = Math.hypot(cb[0] - point[0], cb[1] - point[1]);

    // The curve should pass very close to the target point
    expect(distance).toBeLessThan(0.1);
  });

  it("correctly makes curve pass through target point at different parametric positions", () => {
    const net = vn.polyline([
      [0, 0],
      [100, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const cb: cmath.Vector2 = [40, 30];
    const seg0 = editor.segments[0];
    const frozen = {
      a: editor.vertices[seg0.a] as cmath.Vector2,
      b: editor.vertices[seg0.b] as cmath.Vector2,
      ta: seg0.ta as cmath.Vector2,
      tb: seg0.tb as cmath.Vector2,
    };
    const t0 = 0.25;

    editor.bendSegment(0, t0, cb, frozen);

    const seg = editor.segments[0];
    const p0 = editor.vertices[seg.a];
    const p3 = editor.vertices[seg.b];
    const p1 = cmath.vector2.add(p0, seg.ta);
    const p2 = cmath.vector2.add(p3, seg.tb);

    // Check that the curve passes through the target point at the specified parametric position
    const point = cubicAt(p0, p1, p2, p3, t0);
    const distance = Math.hypot(cb[0] - point[0], cb[1] - point[1]);

    // The curve should pass very close to the target point
    expect(distance).toBeLessThan(0.1);
  });

  it("clears tangents when target is close to linear interpolation", () => {
    const net = vn.polyline([
      [0, 0],
      [100, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const seg0 = editor.segments[0];
    const frozen = {
      a: editor.vertices[seg0.a] as cmath.Vector2,
      b: editor.vertices[seg0.b] as cmath.Vector2,
      ta: seg0.ta as cmath.Vector2,
      tb: seg0.tb as cmath.Vector2,
    };
    const t0 = 0.5;

    // Target point very close to linear interpolation
    const linearInterp: cmath.Vector2 = [
      frozen.a[0] + (frozen.b[0] - frozen.a[0]) * t0,
      frozen.a[1] + (frozen.b[1] - frozen.a[1]) * t0,
    ];
    const cb: cmath.Vector2 = [linearInterp[0] + 0.05, linearInterp[1] + 0.05]; // Very close

    editor.bendSegment(0, t0, cb, frozen);

    const seg = editor.segments[0];

    // Tangents should be cleared (set to zero)
    expect(seg.ta[0]).toBe(0);
    expect(seg.ta[1]).toBe(0);
    expect(seg.tb[0]).toBe(0);
    expect(seg.tb[1]).toBe(0);
  });

  it("demonstrates the correct bend tool behavior", () => {
    // This test demonstrates the behavior described in the user's requirements:
    // - User starts dragging at a parametric position on a segment
    // - The curve should be bent so that the point at that parametric position
    //   moves to the current cursor position
    // - The curve should pass through the target point at the specified parametric position

    const net = vn.polyline([
      [0, 0],
      [100, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const seg0 = editor.segments[0];
    const frozen = {
      a: editor.vertices[seg0.a] as cmath.Vector2,
      b: editor.vertices[seg0.b] as cmath.Vector2,
      ta: seg0.ta as cmath.Vector2,
      tb: seg0.tb as cmath.Vector2,
    };

    // Simulate user starting drag at parametric position 0.3
    const startParametricPosition = 0.3;

    // Simulate user dragging to different target positions
    const targetPositions: cmath.Vector2[] = [
      [30, 20], // Small bend
      [30, 40], // Larger bend
      [30, 60], // Even larger bend
      [30, 80], // Very large bend
    ];

    for (const targetPosition of targetPositions) {
      // Reset to original state
      seg0.ta = frozen.ta;
      seg0.tb = frozen.tb;

      // Apply bend
      editor.bendSegment(0, startParametricPosition, targetPosition, frozen);

      // Verify that the curve passes through the target point at the specified parametric position
      const seg = editor.segments[0];
      const p0 = editor.vertices[seg.a];
      const p3 = editor.vertices[seg.b];
      const p1 = cmath.vector2.add(p0, seg.ta);
      const p2 = cmath.vector2.add(p3, seg.tb);

      const point = cubicAt(p0, p1, p2, p3, startParametricPosition);
      const distance = Math.hypot(
        targetPosition[0] - point[0],
        targetPosition[1] - point[1]
      );

      // The curve should pass very close to the target point
      expect(distance).toBeLessThan(0.1);

      // The point should have moved from its original position
      const originalPoint = cubicAt(
        frozen.a,
        cmath.vector2.add(frozen.a, frozen.ta),
        cmath.vector2.add(frozen.b, frozen.tb),
        frozen.b,
        startParametricPosition
      );

      const newPoint = cubicAt(p0, p1, p2, p3, startParametricPosition);
      const movement = Math.hypot(
        newPoint[0] - originalPoint[0],
        newPoint[1] - originalPoint[1]
      );

      // The point should have moved significantly
      expect(movement).toBeGreaterThan(0.1);
    }
  });
});
