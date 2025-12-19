import cmath from "..";

describe("cmath.quantize", () => {
  it("should quantize to the nearest multiple of the step", () => {
    expect(cmath.quantize(15, 10)).toBe(20);
    expect(cmath.quantize(14, 10)).toBe(10);
    expect(cmath.quantize(16, 10)).toBe(20);
  });

  it("should quantize with decimal step sizes", () => {
    expect(cmath.quantize(0.1123, 0.1)).toBe(0.1);
    expect(cmath.quantize(0.15, 0.1)).toBe(0.2);
    expect(cmath.quantize(0.05, 0.1)).toBe(0.1);
  });

  it("should handle finer step sizes", () => {
    expect(cmath.quantize(7.35, 0.25)).toBe(7.25);
    expect(cmath.quantize(7.4, 0.25)).toBe(7.5);
    expect(cmath.quantize(7.1, 0.25)).toBe(7.0);
  });

  it("should return the value if step size is 1", () => {
    expect(cmath.quantize(5, 1)).toBe(5);
    expect(cmath.quantize(7.3, 1)).toBe(7);
    expect(cmath.quantize(7.8, 1)).toBe(8);
  });

  it("should throw an error if step is zero or negative", () => {
    expect(() => cmath.quantize(15, 0)).toThrow(
      "Step size must be a positive number."
    );
    expect(() => cmath.quantize(15, -10)).toThrow(
      "Step size must be a positive number."
    );
  });

  it("should handle very small step sizes", () => {
    expect(cmath.quantize(0.123456, 0.0001)).toBeCloseTo(0.1235);
    expect(cmath.quantize(0.123456, 0.00001)).toBeCloseTo(0.12346);
    expect(cmath.quantize(0.123456, 0.000001)).toBeCloseTo(0.123456);
  });
});

describe("cmath.gcd", () => {
  test("should compute gcd for typical integer pairs", () => {
    expect(cmath.gcd(12, 8)).toBe(4);
    expect(cmath.gcd(16, 9)).toBe(1);
    expect(cmath.gcd(0, 8)).toBe(8);
    expect(cmath.gcd(12, 0)).toBe(12);
  });

  test("should ignore sign", () => {
    expect(cmath.gcd(-12, 8)).toBe(4);
    expect(cmath.gcd(12, -8)).toBe(4);
    expect(cmath.gcd(-12, -8)).toBe(4);
  });
});

describe("cmath.aspectRatio", () => {
  test("should normalize typical aspect ratios", () => {
    expect(cmath.aspectRatio(1920, 1080)).toEqual([16, 9]);
    expect(cmath.aspectRatio(1024, 1024)).toEqual([1, 1]);
    expect(cmath.aspectRatio(4, 3)).toEqual([4, 3]);
  });

  test("should be robust to scaled inputs", () => {
    expect(cmath.aspectRatio(1600, 900)).toEqual([16, 9]);
    expect(cmath.aspectRatio(3200, 1800)).toEqual([16, 9]);
  });

  test("should return undefined for invalid ratios", () => {
    expect(cmath.aspectRatio(0, 1)).toBeUndefined();
    expect(cmath.aspectRatio(1, 0)).toBeUndefined();
    expect(cmath.aspectRatio(-1, 1)).toBeUndefined();
    expect(cmath.aspectRatio(1, -1)).toBeUndefined();
    expect(cmath.aspectRatio(NaN, 1)).toBeUndefined();
    expect(cmath.aspectRatio(1, NaN)).toBeUndefined();
  });

  test("should respect max_denominator for difficult ratios", () => {
    const result = cmath.aspectRatio(1, Math.PI, 8);
    expect(result).toBeDefined();
    const [p, q] = result!;
    expect(q).toBeLessThanOrEqual(8);
    expect(Math.abs(p / q - 1 / Math.PI)).toBeLessThan(0.1);
  });
});

describe("cmath.powerset", () => {
  test("should return the full powerset when k is -1 or not provided", () => {
    const input = [1, 2, 3];
    const result1 = cmath.powerset(input);
    const result2 = cmath.powerset(input, -1);

    expect(result1).toEqual([
      [],
      [1],
      [2],
      [3],
      [1, 2],
      [1, 3],
      [2, 3],
      [1, 2, 3],
    ]);
    expect(result2).toEqual(result1);
  });

  test("should return subsets of a specific size k", () => {
    const input = [1, 2, 3];
    const result = cmath.powerset(input, 2);
    expect(result).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
  });

  test("should return an empty array if k is out of range", () => {
    expect(cmath.powerset([1, 2], 5)).toEqual([]);
    expect(cmath.powerset([], 2)).toEqual([]);
  });

  test("should handle an empty array (k = -1)", () => {
    expect(cmath.powerset([], -1)).toEqual([[]]);
  });
});
