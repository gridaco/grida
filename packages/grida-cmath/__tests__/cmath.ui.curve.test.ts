import cmath from "..";

// `cmath.ui.Curve` + projector + evaluator. The "spec is the test name"
// convention from `cmath.ui.diagonal.test.ts` — each `it()` reads as a
// rule a reader can grep for.

describe("cmath.ui.evaluateCurve — segment", () => {
  const seg: cmath.ui.Curve = {
    kind: "segment",
    a: [0, 0],
    b: [10, 0],
  };

  it("t=0 returns a", () => {
    expect(cmath.ui.evaluateCurve(seg, 0)).toEqual([0, 0]);
  });

  it("t=1 returns b", () => {
    expect(cmath.ui.evaluateCurve(seg, 1)).toEqual([10, 0]);
  });

  it("t=0.5 returns midpoint", () => {
    expect(cmath.ui.evaluateCurve(seg, 0.5)).toEqual([5, 0]);
  });

  it("t below 0 clamps to a (no extrapolation)", () => {
    expect(cmath.ui.evaluateCurve(seg, -1)).toEqual([0, 0]);
  });

  it("t above 1 clamps to b (no extrapolation)", () => {
    expect(cmath.ui.evaluateCurve(seg, 1.5)).toEqual([10, 0]);
  });

  it("diagonal segment interpolates both axes", () => {
    const diag: cmath.ui.Curve = {
      kind: "segment",
      a: [0, 0],
      b: [10, 10],
    };
    expect(cmath.ui.evaluateCurve(diag, 0.5)).toEqual([5, 5]);
  });
});

describe("cmath.ui.evaluateCurve — arc", () => {
  // Unit circle, quarter arc from +x (angle 0) to +y (angle π/2).
  const arc: cmath.ui.Curve = {
    kind: "arc",
    center: [0, 0],
    radius: 1,
    from: 0,
    to: Math.PI / 2,
  };

  it("t=0 lands at the `from` angle", () => {
    const [x, y] = cmath.ui.evaluateCurve(arc, 0);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(0);
  });

  it("t=1 lands at the `to` angle", () => {
    const [x, y] = cmath.ui.evaluateCurve(arc, 1);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
  });

  it("t=0.5 lands halfway along the sweep", () => {
    const [x, y] = cmath.ui.evaluateCurve(arc, 0.5);
    const s = Math.SQRT1_2;
    expect(x).toBeCloseTo(s);
    expect(y).toBeCloseTo(s);
  });

  it("respects center offset", () => {
    const offset: cmath.ui.Curve = {
      kind: "arc",
      center: [10, 20],
      radius: 2,
      from: 0,
      to: Math.PI / 2,
    };
    const [x, y] = cmath.ui.evaluateCurve(offset, 0);
    expect(x).toBeCloseTo(12);
    expect(y).toBeCloseTo(20);
  });
});

describe("cmath.ui.projectPointOnCurve — segment", () => {
  const seg: cmath.ui.Curve = {
    kind: "segment",
    a: [0, 0],
    b: [10, 0],
  };

  it("point on the segment returns its t and itself", () => {
    const r = cmath.ui.projectPointOnCurve(seg, [3, 0]);
    expect(r.t).toBeCloseTo(0.3);
    expect(r.position[0]).toBeCloseTo(3);
    expect(r.position[1]).toBeCloseTo(0);
  });

  it("perpendicular foot drops to the segment", () => {
    const r = cmath.ui.projectPointOnCurve(seg, [3, 5]);
    expect(r.t).toBeCloseTo(0.3);
    expect(r.position[0]).toBeCloseTo(3);
    expect(r.position[1]).toBeCloseTo(0);
  });

  it("point past `a` clamps to a (no extrapolation)", () => {
    const r = cmath.ui.projectPointOnCurve(seg, [-5, 0]);
    expect(r.t).toBe(0);
    expect(r.position).toEqual([0, 0]);
  });

  it("point past `b` clamps to b (no extrapolation)", () => {
    const r = cmath.ui.projectPointOnCurve(seg, [15, 0]);
    expect(r.t).toBe(1);
    expect(r.position).toEqual([10, 0]);
  });

  it("degenerate segment (a == b) returns t=0 at a", () => {
    const degen: cmath.ui.Curve = {
      kind: "segment",
      a: [5, 5],
      b: [5, 5],
    };
    const r = cmath.ui.projectPointOnCurve(degen, [10, 10]);
    expect(r.t).toBe(0);
    expect(r.position).toEqual([5, 5]);
  });
});

describe("cmath.ui.projectPointOnCurve — arc", () => {
  // Quarter arc, unit circle, 0 → π/2.
  const arc: cmath.ui.Curve = {
    kind: "arc",
    center: [0, 0],
    radius: 1,
    from: 0,
    to: Math.PI / 2,
  };

  it("point on the arc at t=0 returns t=0", () => {
    const r = cmath.ui.projectPointOnCurve(arc, [1, 0]);
    expect(r.t).toBeCloseTo(0);
    expect(r.position[0]).toBeCloseTo(1);
    expect(r.position[1]).toBeCloseTo(0);
  });

  it("point on the arc at t=1 returns t=1", () => {
    const r = cmath.ui.projectPointOnCurve(arc, [0, 1]);
    expect(r.t).toBeCloseTo(1);
    expect(r.position[0]).toBeCloseTo(0);
    expect(r.position[1]).toBeCloseTo(1);
  });

  it("point outside the radius projects to the arc on the matching ray", () => {
    const r = cmath.ui.projectPointOnCurve(arc, [5, 5]);
    expect(r.t).toBeCloseTo(0.5);
    expect(r.position[0]).toBeCloseTo(Math.SQRT1_2);
    expect(r.position[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it("point in a direction outside the arc's sweep clamps to the nearer endpoint", () => {
    // (−1, 0) — opposite of `from`. Closer along normalized [from, to]
    // (which contains [-π, 0) when wrapped) → clamps to t=1 (to=π/2).
    const r = cmath.ui.projectPointOnCurve(arc, [-1, 0]);
    expect(r.t === 0 || r.t === 1).toBe(true);
  });

  it("zero-radius arc returns the center", () => {
    const degen: cmath.ui.Curve = {
      kind: "arc",
      center: [10, 20],
      radius: 0,
      from: 0,
      to: Math.PI / 2,
    };
    const r = cmath.ui.projectPointOnCurve(degen, [100, 100]);
    expect(r.t).toBe(0);
    expect(r.position).toEqual([10, 20]);
  });

  it("non-positive sweep returns the start (degenerate arc)", () => {
    const degen: cmath.ui.Curve = {
      kind: "arc",
      center: [0, 0],
      radius: 1,
      from: 0,
      to: 0,
    };
    const r = cmath.ui.projectPointOnCurve(degen, [1, 1]);
    expect(r.t).toBe(0);
    expect(r.position[0]).toBeCloseTo(1);
    expect(r.position[1]).toBeCloseTo(0);
  });
});

describe("cmath.ui.PointSet — discrete sibling of Curve", () => {
  const points: cmath.Vector2[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  const set: cmath.ui.PointSet = { kind: "points", points };

  it("evaluate at t=0 returns the first point", () => {
    expect(cmath.ui.evaluatePointSet(set, 0)).toEqual([0, 0]);
  });

  it("evaluate at t=1 returns the last point", () => {
    expect(cmath.ui.evaluatePointSet(set, 1)).toEqual([0, 10]);
  });

  it("evaluate at intermediate t rounds to the nearest index", () => {
    // n = 4 → indices 0,1,2,3 at t = 0, 1/3, 2/3, 1.
    expect(cmath.ui.evaluatePointSet(set, 1 / 3)).toEqual([10, 0]);
    expect(cmath.ui.evaluatePointSet(set, 0.6)).toEqual([10, 10]);
  });

  it("project snaps to the nearest point by Euclidean distance", () => {
    expect(cmath.ui.projectPointOnSet(set, [11, 1])).toEqual({
      t: 1 / 3,
      position: [10, 0],
    });
    expect(cmath.ui.projectPointOnSet(set, [9, 9])).toEqual({
      t: 2 / 3,
      position: [10, 10],
    });
    expect(cmath.ui.projectPointOnSet(set, [-5, -5])).toEqual({
      t: 0,
      position: [0, 0],
    });
  });

  it("single-point set pins to that point regardless of query", () => {
    const s: cmath.ui.PointSet = { kind: "points", points: [[42, 17]] };
    expect(cmath.ui.evaluatePointSet(s, 0.7)).toEqual([42, 17]);
    expect(cmath.ui.projectPointOnSet(s, [100, 100])).toEqual({
      t: 0,
      position: [42, 17],
    });
  });

  it("empty-points set degrades gracefully", () => {
    const s: cmath.ui.PointSet = { kind: "points", points: [] };
    expect(cmath.ui.evaluatePointSet(s, 0.5)).toEqual([0, 0]);
    expect(cmath.ui.projectPointOnSet(s, [50, 50])).toEqual({
      t: 0,
      position: [0, 0],
    });
  });

  it("non-uniformly-spaced positions snap as a finite set (star-count case)", () => {
    // 10 outerTip(1) positions for N=3..12 — angles non-uniform.
    const non_uniform: cmath.Vector2[] = Array.from({ length: 10 }, (_, i) => {
      const N = i + 3;
      const angle = -Math.PI / 2 + (2 * Math.PI) / N;
      return [Math.cos(angle), Math.sin(angle)];
    });
    const s: cmath.ui.PointSet = { kind: "points", points: non_uniform };
    // Query the exact angle of N=5's outerTip(1).
    const target_angle = -Math.PI / 2 + (2 * Math.PI) / 5;
    const target: cmath.Vector2 = [
      Math.cos(target_angle),
      Math.sin(target_angle),
    ];
    const r = cmath.ui.projectPointOnSet(s, target);
    expect(r.t).toBeCloseTo(2 / 9); // index 2 (= N - 3 for N=5)
    expect(r.position[0]).toBeCloseTo(target[0]);
    expect(r.position[1]).toBeCloseTo(target[1]);
  });
});

describe("cmath.ui — evaluate ↔ project round-trip", () => {
  it("segment: t → position → t", () => {
    const seg: cmath.ui.Curve = {
      kind: "segment",
      a: [0, 0],
      b: [10, 6],
    };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const pos = cmath.ui.evaluateCurve(seg, t);
      const back = cmath.ui.projectPointOnCurve(seg, pos);
      expect(back.t).toBeCloseTo(t);
      expect(back.position[0]).toBeCloseTo(pos[0]);
      expect(back.position[1]).toBeCloseTo(pos[1]);
    }
  });

  it("arc: t → position → t", () => {
    const arc: cmath.ui.Curve = {
      kind: "arc",
      center: [5, 5],
      radius: 3,
      from: -Math.PI / 2,
      to: Math.PI / 2,
    };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const pos = cmath.ui.evaluateCurve(arc, t);
      const back = cmath.ui.projectPointOnCurve(arc, pos);
      expect(back.t).toBeCloseTo(t);
      expect(back.position[0]).toBeCloseTo(pos[0]);
      expect(back.position[1]).toBeCloseTo(pos[1]);
    }
  });
});
