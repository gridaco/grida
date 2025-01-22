import { snap } from "../_snap";

const sortnum = (a: number, b: number) => a - b;

describe("snap.spacing.projection", () => {
  it("should calculate projections for non-overlapping ranges", () => {
    const ranges: snap.spacing.Range[] = [
      [0, 10],
      [20, 30],
    ];

    const result = snap.spacing.repeatedpoints(ranges);

    expect(result.a.flat()).toEqual([40]); // Projection based on b2 + space
    expect(result.b.flat()).toEqual([-10]); // Projection based on a1 - space
    expect(result.c.flat()).toEqual([15]); // Projection based on b1 + space / 2
  });

  it("should return empty projections for overlapping ranges", () => {
    const ranges: snap.spacing.Range[] = [
      [0, 10],
      [5, 15],
    ];

    const result = snap.spacing.repeatedpoints(ranges);

    expect(result.a.flat()).toEqual([]); // No valid projections
    expect(result.b.flat()).toEqual([]); // No valid projections
    expect(result.c.flat()).toEqual([]); // No valid projections
  });

  it("should handle multiple non-overlapping ranges", () => {
    const ranges: snap.spacing.Range[] = [
      [0, 10], // 1
      [20, 30], // 2
      [40, 50], // 3
    ];

    const result = snap.spacing.repeatedpoints(ranges);

    expect(result.a).toEqual([
      [40], // 1_2
      [80], // 1_3
      [60], // 2_3
    ]);
    expect(result.b.flat().sort(sortnum)).toEqual([-30, -10, 10]);
    expect(result.c.flat().sort(sortnum)).toEqual([15, 25, 35]);
  });

  it("should handle a single range (no combinations possible)", () => {
    const ranges: snap.spacing.Range[] = [[0, 10]];

    const result = snap.spacing.repeatedpoints(ranges);

    expect(result.a.flat()).toEqual([]); // No combinations possible
    expect(result.b.flat()).toEqual([]); // No combinations possible
    expect(result.c.flat()).toEqual([]); // No combinations possible
  });

  it("should handle empty input", () => {
    const ranges: snap.spacing.Range[] = [];

    const result = snap.spacing.repeatedpoints(ranges);

    expect(result.a.flat()).toEqual([]);
    expect(result.b.flat()).toEqual([]);
    expect(result.c.flat()).toEqual([]);
  });

  it("should ignore invalid combinations (negative space)", () => {
    const ranges: snap.spacing.Range[] = [
      [0, 10],
      [5, 15], // Overlapping range
      [20, 30],
    ];

    const result = snap.spacing.repeatedpoints(ranges);

    expect(result.a.flat().sort(sortnum)).toEqual([35, 40]); // Only valid projection
    expect(result.b.flat().sort(sortnum)).toEqual([-10, 0]); // Only valid projection
    expect(result.c.flat().sort(sortnum)).toEqual([15, 17.5]); // Only valid projection
  });

  it("should handle multiple ranges with 5 inputs", () => {
    const ranges: snap.spacing.Range[] = [
      [0, 10], // First range
      [15, 25], // Second range
      [30, 40], // Third range
      [50, 60], // Fourth range
      [70, 80], // Fifth range
    ];

    const result = snap.spacing.repeatedpoints(ranges);

    const sortnum = (a: number, b: number) => a - b;

    expect(result.a.flat().sort(sortnum)).toEqual([
      30, 45, 60, 70, 85, 90, 100, 110, 125, 140,
    ]);
    expect(result.b.flat().sort(sortnum)).toEqual([
      -60, -40, -30, -20, -10, -5, 0, 10, 20, 40,
    ]);
    expect(result.c.flat().sort(sortnum)).toEqual([
      12.5, 20, 27.5, 30, 37.5, 40, 45, 47.5, 55, 65,
    ]);
  });
});
