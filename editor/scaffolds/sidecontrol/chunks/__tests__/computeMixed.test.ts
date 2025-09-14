import grida from "@grida/schema";
import { computeMixed } from "../compute-mixed";

describe("computeMixed", () => {
  it("returns number when all values equal", () => {
    expect(computeMixed([1, 1, 1])).toBe(1);
  });

  it("returns grida.mixed when values differ", () => {
    expect(computeMixed([1, 2])).toBe(grida.mixed);
  });

  it("returns empty string for empty array", () => {
    expect(computeMixed([])).toBe("");
  });

  it("ignores undefined points when computing", () => {
    const points: ([number, number] | undefined)[] = [[1, 2], undefined];
    const safe = points.filter(
      (p): p is [number, number] => Array.isArray(p)
    );
    expect(computeMixed(safe.map((p) => p[0]))).toBe(1);
  });
});
