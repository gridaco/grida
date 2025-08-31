import cmath from "..";

describe("cmath.ui.gradient", () => {
  it("returns identity transform for base linear gradient", () => {
    const points = cmath.ui.gradient.baseControlPoints("linear_gradient");
    const t = cmath.ui.gradient.transformFromControlPoints(
      points,
      "linear_gradient"
    );
    expect(t[0][0]).toBeCloseTo(1);
    expect(t[0][1]).toBeCloseTo(0);
    expect(t[0][2]).toBeCloseTo(0);
    expect(t[1][0]).toBeCloseTo(0);
    expect(t[1][1]).toBeCloseTo(1);
    expect(t[1][2]).toBeCloseTo(0);
  });

  it("returns identity transform for base radial gradient", () => {
    const points = cmath.ui.gradient.baseControlPoints("radial_gradient");
    const t = cmath.ui.gradient.transformFromControlPoints(
      points,
      "radial_gradient"
    );
    expect(t[0][0]).toBeCloseTo(1);
    expect(t[0][1]).toBeCloseTo(0);
    expect(t[0][2]).toBeCloseTo(0);
    expect(t[1][0]).toBeCloseTo(0);
    expect(t[1][1]).toBeCloseTo(1);
    expect(t[1][2]).toBeCloseTo(0);
  });

  it("translates radial gradient control points", () => {
    const base = cmath.ui.gradient.baseControlPoints("radial_gradient");
    const t: cmath.Vector2 = [0.2, 0.3];
    const points = {
      A: [base.A[0] + t[0], base.A[1] + t[1]] as cmath.Vector2,
      B: [base.B[0] + t[0], base.B[1] + t[1]] as cmath.Vector2,
      C: [base.C[0] + t[0], base.C[1] + t[1]] as cmath.Vector2,
    };
    const transform = cmath.ui.gradient.transformFromControlPoints(
      points,
      "radial_gradient"
    );
    expect(transform[0][2]).toBeCloseTo(t[0]);
    expect(transform[1][2]).toBeCloseTo(t[1]);
    expect(transform[0][0]).toBeCloseTo(1);
    expect(transform[1][1]).toBeCloseTo(1);
  });

  it("computes rotation for linear gradient", () => {
    const base = cmath.ui.gradient.baseControlPoints("linear_gradient");
    const points = {
      A: [0.5, 0.5] as cmath.Vector2,
      B: [0.5, 1.5] as cmath.Vector2,
      C: base.C,
    };
    const transform = cmath.ui.gradient.transformFromControlPoints(
      points,
      "linear_gradient"
    );
    expect(transform[0][0]).toBeCloseTo(0);
    expect(transform[0][1]).toBeCloseTo(-1);
    expect(transform[1][0]).toBeCloseTo(1);
    expect(transform[1][1]).toBeCloseTo(0);
    expect(transform[0][2]).toBeCloseTo(1);
    expect(transform[1][2]).toBeCloseTo(0.5);
  });
});

