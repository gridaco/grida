import cmath from "..";

describe("cmath.rational", () => {
  describe("approximateFraction", () => {
    test("should return exact fraction for integers", () => {
      expect(cmath.rational.approximateFraction(2)).toEqual([2, 1]);
      expect(cmath.rational.approximateFraction(-3)).toEqual([-3, 1]);
    });

    test("should return 0 as 0/1", () => {
      expect(cmath.rational.approximateFraction(0)).toEqual([0, 1]);
    });

    test("should approximate common rationals", () => {
      expect(cmath.rational.approximateFraction(0.5)).toEqual([1, 2]);
      expect(cmath.rational.approximateFraction(1 / 3)).toEqual([1, 3]);
      expect(cmath.rational.approximateFraction(-1 / 3)).toEqual([-1, 3]);
    });

    test("should respect max_denominator", () => {
      const result = cmath.rational.approximateFraction(Math.PI, 10);
      expect(result).toBeDefined();
      const [p, q] = result!;
      expect(q).toBeLessThanOrEqual(10);
      expect(Math.abs(p / q - Math.PI)).toBeLessThan(0.1);
    });

    test("should return undefined on invalid input", () => {
      expect(cmath.rational.approximateFraction(NaN)).toBeUndefined();
      expect(cmath.rational.approximateFraction(Infinity)).toBeUndefined();
      expect(cmath.rational.approximateFraction(1, 0)).toBeUndefined();
      expect(cmath.rational.approximateFraction(1, -1)).toBeUndefined();
    });
  });
});
