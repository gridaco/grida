import cmath from "..";

function expectTransformsClose(a: cmath.Transform, b: cmath.Transform) {
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 3; j++) {
      expect(a[i][j]).toBeCloseTo(b[i][j], 6);
    }
  }
}

describe("cmath.transform", () => {
  describe("multiply()", () => {
    it("multiplies identity with identity", () => {
      expectTransformsClose(
        cmath.transform.multiply(
          cmath.transform.identity,
          cmath.transform.identity
        ),
        cmath.transform.identity
      );
    });

    it("multiplies translation with identity", () => {
      const t: cmath.Transform = [
        [1, 0, 5],
        [0, 1, -3],
      ];
      expectTransformsClose(
        cmath.transform.multiply(t, cmath.transform.identity),
        t
      );
      expectTransformsClose(
        cmath.transform.multiply(cmath.transform.identity, t),
        t
      );
    });

    it("multiplies two translations", () => {
      const t1: cmath.Transform = [
        [1, 0, 5],
        [0, 1, -3],
      ];
      const t2: cmath.Transform = [
        [1, 0, 2],
        [0, 1, 4],
      ];
      const expected: cmath.Transform = [
        [1, 0, 7], // 5 + 2
        [0, 1, 1], // -3 + 4
      ];
      expectTransformsClose(cmath.transform.multiply(t1, t2), expected);
    });

    it("multiplies scaling with translation", () => {
      const scale: cmath.Transform = [
        [2, 0, 0],
        [0, 3, 0],
      ];
      const translate: cmath.Transform = [
        [1, 0, 5],
        [0, 1, -3],
      ];
      const expected: cmath.Transform = [
        [2, 0, 10], // 2*5
        [0, 3, -9], // 3*(-3)
      ];
      expectTransformsClose(
        cmath.transform.multiply(scale, translate),
        expected
      );
    });
  });

  describe("scale()", () => {
    it("scales identity around origin", () => {
      const result = cmath.transform.scale(cmath.transform.identity, 2, [0, 0]);
      const expected: cmath.Transform = [
        [2, 0, 0],
        [0, 2, 0],
      ];
      expectTransformsClose(result, expected);
    });

    it("scales identity around non-origin point", () => {
      const result = cmath.transform.scale(
        cmath.transform.identity,
        2,
        [50, 50]
      );
      const expected: cmath.Transform = [
        [2, 0, -50], // 50 - 2*50
        [0, 2, -50], // 50 - 2*50
      ];
      expectTransformsClose(result, expected);
    });

    it("scales with non-uniform scaling", () => {
      const result = cmath.transform.scale(
        cmath.transform.identity,
        [2, 3],
        [0, 0]
      );
      const expected: cmath.Transform = [
        [2, 0, 0],
        [0, 3, 0],
      ];
      expectTransformsClose(result, expected);
    });

    it("scales existing transform", () => {
      const existing: cmath.Transform = [
        [1, 0, 10],
        [0, 1, 20],
      ];
      const result = cmath.transform.scale(existing, 2, [0, 0]);
      const expected: cmath.Transform = [
        [2, 0, 20], // 2*10
        [0, 2, 40], // 2*20
      ];
      expectTransformsClose(result, expected);
    });

    it("scales around arbitrary point", () => {
      const result = cmath.transform.scale(
        cmath.transform.identity,
        2,
        [10, 20]
      );
      const expected: cmath.Transform = [
        [2, 0, -10], // 10 - 2*10
        [0, 2, -20], // 20 - 2*20
      ];
      expectTransformsClose(result, expected);
    });
  });

  describe("rotate()", () => {
    it("rotates identity around origin by 90 degrees", () => {
      const result = cmath.transform.rotate(
        cmath.transform.identity,
        90,
        [0, 0]
      );
      const expected: cmath.Transform = [
        [0, -1, 0],
        [1, 0, 0],
      ];
      expectTransformsClose(result, expected);
    });

    it("rotates identity around origin by 180 degrees", () => {
      const result = cmath.transform.rotate(
        cmath.transform.identity,
        180,
        [0, 0]
      );
      const expected: cmath.Transform = [
        [-1, 0, 0],
        [0, -1, 0],
      ];
      expectTransformsClose(result, expected);
    });

    it("rotates identity around non-origin point", () => {
      const result = cmath.transform.rotate(
        cmath.transform.identity,
        90,
        [10, 20]
      );
      const expected: cmath.Transform = [
        [0, -1, 30], // 10 - 0*10 + 1*20
        [1, 0, 10], // 20 - 1*10 - 0*20
      ];
      expectTransformsClose(result, expected);
    });

    it("rotates existing transform", () => {
      const existing: cmath.Transform = [
        [1, 0, 5],
        [0, 1, 10],
      ];
      const result = cmath.transform.rotate(existing, 90, [0, 0]);
      const expected: cmath.Transform = [
        [0, -1, -10], // rotation applied to translation: 0*5 + (-1)*10
        [1, 0, 5], // rotation applied to translation: 1*5 + 0*10
      ];
      expectTransformsClose(result, expected);
    });

    it("rotates by 0 degrees (no change)", () => {
      const existing: cmath.Transform = [
        [2, 1, 5],
        [0, 3, 10],
      ];
      const result = cmath.transform.rotate(existing, 0, [0, 0]);
      expectTransformsClose(result, existing);
    });
  });

  describe("translate()", () => {
    it("translates identity", () => {
      const result = cmath.transform.translate(
        cmath.transform.identity,
        [5, -3]
      );
      const expected: cmath.Transform = [
        [1, 0, 5],
        [0, 1, -3],
      ];
      expectTransformsClose(result, expected);
    });

    it("translates existing transform", () => {
      const existing: cmath.Transform = [
        [2, 0, 10],
        [0, 3, 20],
      ];
      const result = cmath.transform.translate(existing, [5, -3]);
      const expected: cmath.Transform = [
        [2, 0, 15], // 10 + 5
        [0, 3, 17], // 20 + (-3)
      ];
      expectTransformsClose(result, expected);
    });

    it("translates by zero (no change)", () => {
      const existing: cmath.Transform = [
        [2, 1, 5],
        [0, 3, 10],
      ];
      const result = cmath.transform.translate(existing, [0, 0]);
      expectTransformsClose(result, existing);
    });
  });

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
