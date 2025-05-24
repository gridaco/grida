import { cmath } from "..";

function expectTransformsClose(a: cmath.Transform, b: cmath.Transform) {
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 3; j++) {
      expect(a[i][j]).toBeCloseTo(b[i][j], 6);
    }
  }
}

describe("cmath.transform", () => {
  describe("invert()", () => {
    it("inverts identity", () => {
      expectTransformsClose(
        cmath.transform.invert(cmath.transform.identity),
        cmath.transform.identity
      );
    });

    it("inverts pure translation", () => {
      const t: cmath.Transform = [
        [1, 0, 5],
        [0, 1, -3],
      ];
      const inv = cmath.transform.invert(t);
      expect(inv).toEqual([
        [1, -0, -5],
        [-0, 1, 3],
      ]);
      expectTransformsClose(
        cmath.transform.multiply(inv, t),
        cmath.transform.identity
      );
    });

    it("inverts pure scaling", () => {
      const t: cmath.Transform = [
        [2, 0, 0],
        [0, 3, 0],
      ];
      const inv = cmath.transform.invert(t);
      expect(inv).toEqual([
        [0.5, -0, 0],
        [-0, 1 / 3, 0],
      ]);
      expectTransformsClose(
        cmath.transform.multiply(inv, t),
        cmath.transform.identity
      );
    });

    it("inverts rotation", () => {
      const θ = Math.PI / 4;
      const cos = Math.cos(θ),
        sin = Math.sin(θ);
      const t: cmath.Transform = [
        [cos, -sin, 0],
        [sin, cos, 0],
      ];
      const expected: cmath.Transform = [
        [cos, sin, 0],
        [-sin, cos, 0],
      ];
      expectTransformsClose(cmath.transform.invert(t), expected);
      expectTransformsClose(
        cmath.transform.multiply(cmath.transform.invert(t), t),
        cmath.transform.identity
      );
    });

    it("inverts combined transform", () => {
      const t: cmath.Transform = [
        [2, 1, 3],
        [0, 4, -2],
      ];
      const inv = cmath.transform.invert(t);
      // applying inv then t yields identity
      expectTransformsClose(
        cmath.transform.multiply(inv, t),
        cmath.transform.identity
      );
      // double-invert returns original
      expectTransformsClose(cmath.transform.invert(inv), t);
    });

    it("throws on non-invertible (det=0)", () => {
      const t: cmath.Transform = [
        [1, 2, 3],
        [2, 4, 5],
      ]; // det = 1*4 - 2*2 = 0
      expect(() => cmath.transform.invert(t)).toThrow(/not invertible/i);
    });
  });
});
