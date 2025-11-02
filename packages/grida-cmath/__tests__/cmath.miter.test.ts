import cmath from "..";

describe("cmath.miter", () => {
  describe("ratio", () => {
    it("should return the correct miter ratio for common angles", () => {
      // Test known values with reasonable precision
      expect(cmath.miter.ratio(30)).toBeCloseTo(3.864, 3);
      expect(cmath.miter.ratio(28.96)).toBeCloseTo(4.0, 2);
      expect(cmath.miter.ratio(60)).toBeCloseTo(2.0, 3);
      expect(cmath.miter.ratio(90)).toBeCloseTo(1.414, 3);
      expect(cmath.miter.ratio(120)).toBeCloseTo(1.155, 3);
    });

    it("should return 1 for 180 degrees (no miter extension)", () => {
      expect(cmath.miter.ratio(180)).toBeCloseTo(1.0, 10);
    });

    it("should return very large values for very acute angles", () => {
      // As angle approaches 0, ratio approaches infinity
      expect(cmath.miter.ratio(10)).toBeCloseTo(11.474, 2);
      expect(cmath.miter.ratio(5)).toBeCloseTo(22.926, 2);
      expect(cmath.miter.ratio(1)).toBeGreaterThan(100);
    });

    it("should handle right angles correctly", () => {
      // 90 degrees should give sqrt(2)
      expect(cmath.miter.ratio(90)).toBeCloseTo(Math.SQRT2, 5);
    });

    it("should be symmetric around 180 degrees", () => {
      // ratio(180 - x) should equal ratio(180 + x) due to symmetry
      expect(cmath.miter.ratio(160)).toBeCloseTo(cmath.miter.ratio(200), 5);
      expect(cmath.miter.ratio(150)).toBeCloseTo(cmath.miter.ratio(210), 5);
    });
  });

  describe("angle", () => {
    it("should return the correct angle for common miter ratios", () => {
      expect(cmath.miter.angle(4.0)).toBeCloseTo(28.96, 1);
      expect(cmath.miter.angle(2.0)).toBeCloseTo(60.0, 1);
      expect(cmath.miter.angle(1.414)).toBeCloseTo(90.0, 1);
      expect(cmath.miter.angle(10.0)).toBeCloseTo(11.478, 2);
    });

    it("should return 180 for ratio of 1", () => {
      expect(cmath.miter.angle(1.0)).toBe(180);
    });

    it("should return 180 for ratios less than or equal to 1", () => {
      expect(cmath.miter.angle(1.0)).toBe(180);
      expect(cmath.miter.angle(0.5)).toBe(180);
      expect(cmath.miter.angle(0.0)).toBe(180);
      expect(cmath.miter.angle(-1.0)).toBe(180);
    });

    it("should return very small angles for very large ratios", () => {
      expect(cmath.miter.angle(20)).toBeCloseTo(5.74, 1);
      expect(cmath.miter.angle(100)).toBeCloseTo(1.146, 2);
    });
  });

  describe("ratio and angle inverse relationship", () => {
    it("should satisfy: angle(ratio(x)) === x for valid angles", () => {
      const testAngles = [30, 45, 60, 90, 120, 150];
      testAngles.forEach((angleDeg) => {
        const r = cmath.miter.ratio(angleDeg);
        const recoveredAngle = cmath.miter.angle(r);
        expect(recoveredAngle).toBeCloseTo(angleDeg, 2);
      });
    });

    it("should satisfy: ratio(angle(x)) === x for valid ratios", () => {
      const testRatios = [1.5, 2.0, 3.0, 4.0, 5.0, 10.0];
      testRatios.forEach((ratio) => {
        const angleDeg = cmath.miter.angle(ratio);
        const recoveredRatio = cmath.miter.ratio(angleDeg);
        expect(recoveredRatio).toBeCloseTo(ratio, 2);
      });
    });

    it("should handle edge case: ratio(180) = 1, angle(1) = 180", () => {
      expect(cmath.miter.ratio(180)).toBeCloseTo(1.0, 10);
      expect(cmath.miter.angle(1.0)).toBe(180);

      // Verify round-trip
      expect(cmath.miter.angle(cmath.miter.ratio(180))).toBe(180);
    });
  });

  describe("practical use cases", () => {
    it("should match common miter limit defaults", () => {
      // Standard miter limit of 4.0 corresponds to ~29° angle
      const angle = cmath.miter.angle(4.0);
      expect(angle).toBeCloseTo(28.96, 1);

      // Verify reverse
      const ratio = cmath.miter.ratio(28.96);
      expect(ratio).toBeCloseTo(4.0, 1);
    });

    it("should handle SVG miter limit of 4 (default)", () => {
      // SVG/CSS default miter limit is 4, which means angles < ~29° will bevel
      const criticalAngle = cmath.miter.angle(4);
      expect(criticalAngle).toBeCloseTo(28.955, 2);
    });

    it("should calculate ratios for typical UI angles", () => {
      // Sharp corners (30°) need high miter limits
      expect(cmath.miter.ratio(30)).toBeGreaterThan(3.8);

      // Right angles (90°) need smaller miter limits
      expect(cmath.miter.ratio(90)).toBeCloseTo(1.414, 2);

      // Obtuse angles (120°) need even smaller limits
      expect(cmath.miter.ratio(120)).toBeCloseTo(1.155, 2);
    });
  });

  describe("mathematical properties", () => {
    it("should be monotonically decreasing (smaller angle = larger ratio)", () => {
      // As angle decreases, miter ratio should increase
      expect(cmath.miter.ratio(30)).toBeGreaterThan(cmath.miter.ratio(60));
      expect(cmath.miter.ratio(60)).toBeGreaterThan(cmath.miter.ratio(90));
      expect(cmath.miter.ratio(90)).toBeGreaterThan(cmath.miter.ratio(120));
      expect(cmath.miter.ratio(120)).toBeGreaterThan(cmath.miter.ratio(180));
    });

    it("should be monotonically decreasing for angle() function", () => {
      // As ratio increases, angle should decrease
      expect(cmath.miter.angle(2)).toBeGreaterThan(cmath.miter.angle(4));
      expect(cmath.miter.angle(4)).toBeGreaterThan(cmath.miter.angle(6));
      expect(cmath.miter.angle(6)).toBeGreaterThan(cmath.miter.angle(10));
    });

    it("should satisfy the formula: ratio = 1 / sin(angle/2)", () => {
      const testAngles = [30, 45, 60, 90, 120, 150];
      testAngles.forEach((angleDeg) => {
        const expectedRatio = 1 / Math.sin((angleDeg * Math.PI) / 360);
        const actualRatio = cmath.miter.ratio(angleDeg);
        expect(actualRatio).toBeCloseTo(expectedRatio, 10);
      });
    });
  });

  describe("boundary conditions", () => {
    it("should handle very small angles without producing NaN or Infinity", () => {
      const ratio = cmath.miter.ratio(0.1);
      expect(ratio).toBeGreaterThan(1000);
      expect(Number.isFinite(ratio)).toBe(true);
    });

    it("should handle very large ratios without producing NaN", () => {
      const angle = cmath.miter.angle(1000);
      expect(angle).toBeGreaterThan(0);
      expect(angle).toBeLessThan(1);
      expect(Number.isFinite(angle)).toBe(true);
    });

    it("should return 180 for edge case ratios <= 1", () => {
      expect(cmath.miter.angle(1.0)).toBe(180);
      expect(cmath.miter.angle(0.999)).toBe(180);
      expect(cmath.miter.angle(0.5)).toBe(180);
      expect(cmath.miter.angle(0)).toBe(180);
    });
  });
});
