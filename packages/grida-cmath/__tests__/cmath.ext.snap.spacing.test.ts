import cmath from "..";

describe("spacing.plotDistributionGeometry", () => {
  it("should return empty loops if no valid gaps exist", () => {
    const ranges: cmath.Range[] = [
      [0, 10],
      [5, 15], // Overlap => no positive gap
    ];
    const result = cmath.ext.snap.spacing.plotDistributionGeometry(ranges);
    expect(result.loops).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(result.a).toEqual([]);
    expect(result.b).toEqual([]);
  });

  it("should compute single gap with 2 non-overlapping ranges", () => {
    const ranges: cmath.Range[] = [
      [0, 10],
      [20, 30],
    ];
    const result = cmath.ext.snap.spacing.plotDistributionGeometry(ranges);
    expect(result.loops).toEqual([[0, 1]]);
    expect(result.gaps).toEqual([10]); // single gap = 20 - 10
    expect(result.a[0]).toEqual([
      { p: 30 + 10, o: 30, fwd: 0 }, // default forward extension
    ]);
    expect(result.b[0]).toEqual([
      { p: 0 - 10, o: 0, fwd: 0 }, // default backward extension
    ]);
  });

  it("should compute multiple loops and gaps for more than 2 ranges", () => {
    const ranges: cmath.Range[] = [
      [0, 10], // gap=10
      [20, 30], // gap=10
      [40, 50], // gap=10
    ];
    const result = cmath.ext.snap.spacing.plotDistributionGeometry(ranges);
    // loops: (0,1), (1,2), (0,2)
    expect(result.loops).toHaveLength(3);
    expect(result.gaps).toHaveLength(3);
    // a & b arrays for each loop
    expect(result.a.length).toBe(3);
    expect(result.b.length).toBe(3);
  });

  it("should include center-based points when agentLength < gap", () => {
    const ranges: cmath.Range[] = [
      [0, 10],
      [20, 30],
    ];
    const agentLength = 5; // smaller than gap=10
    const result = cmath.ext.snap.spacing.plotDistributionGeometry(
      ranges,
      agentLength
    );
    // "a" and "b" arrays for the single loop (0,1)
    // default: a => [ { p: 30+10 } ], plus center-based
    expect(result.a[0]).toHaveLength(2);
    expect(result.b[0]).toHaveLength(2);
    // second items in a/b should be from center-based logic
    const centerA = result.a[0][1];
    const centerB = result.b[0][1];
    expect(centerA).toMatchObject({ fwd: -1 }); // indicates center-based
    expect(centerB).toMatchObject({ fwd: -1 });
  });

  it("should skip center-based points when agentLength >= gap", () => {
    const ranges: cmath.Range[] = [
      [0, 10],
      [20, 30],
    ];
    const agentLength = 10; // same as gap=10 => skip center-based
    const result = cmath.ext.snap.spacing.plotDistributionGeometry(
      ranges,
      agentLength
    );
    // only default forward/back points in a[0]/b[0]
    expect(result.a[0]).toHaveLength(1);
    expect(result.b[0]).toHaveLength(1);
  });

  it("should ensure that sizes of a, b, and loops match for complex inputs", () => {
    const ranges: cmath.Range[] = [
      [0, 15],
      [10, 25],
      [25, 30],
      [40, 55],
      [50, 65],
      [80, 95],
      [150, 165],
    ];

    const agentLength = 10; // Arbitrary agent length for projections

    const result = cmath.ext.snap.spacing.plotDistributionGeometry(
      ranges,
      agentLength
    );

    // Ensure the number of loops matches the sizes of a and b
    expect(result.loops.length).toBe(result.a.length);
    expect(result.loops.length).toBe(result.b.length);

    // Additional check: ensure the projections in a and b align with loops
    result.loops.forEach((loop, i) => {
      expect(result.a[i]).toBeDefined();
      expect(result.b[i]).toBeDefined();
    });

    // Check if all loops have corresponding gaps
    expect(result.loops.length).toBe(result.gaps.length);
  });
});
