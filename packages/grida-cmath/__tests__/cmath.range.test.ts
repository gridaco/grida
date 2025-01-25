// tests/range.test.ts

import { cmath } from "..";

describe("cmath.range", () => {
  describe("groupRangesByUniformGap", () => {
    /** =====================
     *  Clean Numbers Tests
     *  ===================== */

    test("should group three non-overlapping ranges with consistent gaps", () => {
      const ranges: cmath.Range[] = [
        [0, 10],
        [15, 25],
        [30, 40],
      ];
      const result = cmath.range.groupRangesByUniformGap(ranges);
      expect(result).toEqual(
        expect.arrayContaining([
          {
            loop: [0, 1, 2],
            min: 0,
            max: 40,
            gap: 5,
          },
          {
            loop: [0, 1],
            min: 0,
            max: 25,
            gap: 5,
          },
          {
            loop: [1, 2],
            min: 15,
            max: 40,
            gap: 5,
          },
        ])
      );
    });

    test("should group two ranges with a consistent gap", () => {
      const ranges: cmath.Range[] = [
        [10, 20],
        [30, 40],
      ];
      const result = cmath.range.groupRangesByUniformGap(ranges);
      expect(result).toEqual([
        {
          loop: [0],
          min: 10,
          max: 20,
          gap: 0,
        },
        {
          loop: [1],
          min: 30,
          max: 40,
          gap: 0,
        },
        {
          loop: [0, 1],
          min: 10,
          max: 40,
          gap: 10,
        },
      ]);
    });

    test("should group four ranges with consistent gaps", () => {
      const ranges: cmath.Range[] = [
        [0, 10],
        [15, 25],
        [30, 40],
        [45, 55],
      ];
      const result = cmath.range.groupRangesByUniformGap(ranges);
      expect(result).toEqual(
        expect.arrayContaining([
          {
            loop: [0, 1, 2, 3],
            min: 0,
            max: 55,
            gap: 5,
          },
          {
            loop: [0, 1],
            min: 0,
            max: 25,
            gap: 5,
          },
          {
            loop: [1, 2],
            min: 15,
            max: 40,
            gap: 5,
          },
          {
            loop: [2, 3],
            min: 30,
            max: 55,
            gap: 5,
          },
        ])
      );
    });

    /** =====================
     *  Dirty Numbers Tests
     *  ===================== */

    test("should handle ranges with floating-point numbers and consistent gaps within tolerance", () => {
      const ranges: cmath.Range[] = [
        [0.5, 2.5],
        [4, 6.5],
        [8.5, 10.0],
        [11.5, 13.5],
      ];
      const tolerance = 0.2;
      const result = cmath.range.groupRangesByUniformGap(
        ranges,
        undefined,
        tolerance
      );
      expect(result).toEqual(
        expect.arrayContaining([
          { loop: [0, 1], gap: 1.5, max: 6.5, min: 0.5 },
          { loop: [0, 2], gap: 6, max: 10, min: 0.5 },
          { loop: [0, 3], gap: 9, max: 13.5, min: 0.5 },
          { loop: [1, 2], gap: 2, max: 10, min: 4 },
          { loop: [1, 3], gap: 5, max: 13.5, min: 4 },
          { loop: [2, 3], gap: 1.5, max: 13.5, min: 8.5 },
        ])
      );
    });

    test("should handle ranges with irregular gaps and multiple groupings", () => {
      const ranges: cmath.Range[] = [
        [1, 3],
        [5, 7],
        [10, 14],
        [18, 25],
      ];
      const result = cmath.range.groupRangesByUniformGap(ranges);
      expect(result).toEqual(
        expect.arrayContaining([
          {
            loop: [0, 1],
            min: 1,
            max: 7,
            gap: 2,
          },
          {
            loop: [1, 2],
            min: 5,
            max: 14,
            gap: 3,
          },
          {
            loop: [2, 3],
            min: 10,
            max: 25,
            gap: 4,
          },
        ])
      );
    });

    // /** =====================
    //  *  Overlapping Ranges Tests
    //  *  ===================== */

    test("should ignore overlapping ranges resulting in negative gaps", () => {
      const ranges: cmath.Range[] = [
        [0, 10],
        [8, 18],
        [20, 30],
      ];
      const result = cmath.range.groupRangesByUniformGap(ranges);
      expect(result).toEqual(
        expect.arrayContaining([
          {
            loop: [0, 2],
            min: 0,
            max: 30,
            gap: 10,
          },
          {
            loop: [1, 2],
            min: 8,
            max: 30,
            gap: 2,
          },
        ])
      );
    });

    test("should handle multiple overlapping ranges with 0 or positive gaps", () => {
      const ranges: cmath.Range[] = [
        [0, 10],
        [5, 15],
        [10, 20],
        [15, 25],
      ];
      const result = cmath.range.groupRangesByUniformGap(ranges);
      expect(result).toEqual(
        expect.arrayContaining([
          // [overlapping, ignored.]
          // [0, 1]
          // [1, 2]
          // [2, 3]
          {
            loop: [0, 2],
            min: 0,
            max: 20,
            gap: 0,
          },
          {
            loop: [0, 3],
            min: 0,
            max: 25,
            gap: 5,
          },
          {
            loop: [1, 3],
            min: 5,
            max: 25,
            gap: 0,
          },
        ])
      );
    });

    test("should not handle completely overlapping ranges", () => {
      const ranges: cmath.Range[] = [
        [0, 10],
        [0, 10],
        [0, 10],
      ];
      const result = cmath.range.groupRangesByUniformGap(ranges);
      expect(result).toEqual([
        {
          loop: [0],
          min: 0,
          max: 10,
          gap: 0,
        },
        {
          loop: [1],
          min: 0,
          max: 10,
          gap: 0,
        },
        {
          loop: [2],
          min: 0,
          max: 10,
          gap: 0,
        },
      ]);
    });
  });

  test("should group ranges with a consistent gap and fixed k size (k=2) for a large set of ranges", () => {
    const ranges: cmath.Range[] = [
      [0, 10],
      [15, 25],
      [30, 40],
      [45, 55],
      [60, 70],
    ];

    const k = 2; // Fixed subset size
    const tolerance = 0; // No tolerance; gaps must be exactly uniform

    const result = cmath.range.groupRangesByUniformGap(ranges, k, tolerance);

    const expectedGroupings = [
      { gap: 5, loop: [0, 1], max: 25, min: 0 },
      { gap: 20, loop: [0, 2], max: 40, min: 0 },
      { gap: 35, loop: [0, 3], max: 55, min: 0 },
      { gap: 50, loop: [0, 4], max: 70, min: 0 },
      { gap: 5, loop: [1, 2], max: 40, min: 15 },
      { gap: 20, loop: [1, 3], max: 55, min: 15 },
      { gap: 35, loop: [1, 4], max: 70, min: 15 },
      { gap: 5, loop: [2, 3], max: 55, min: 30 },
      { gap: 20, loop: [2, 4], max: 70, min: 30 },
      { gap: 5, loop: [3, 4], max: 70, min: 45 },
    ];

    expect(result).toEqual(expect.arrayContaining(expectedGroupings));
    expect(result.length).toBe(expectedGroupings.length);
  });
});
