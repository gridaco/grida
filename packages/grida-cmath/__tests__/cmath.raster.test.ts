import cmath from "..";

describe("cmath.raster", () => {
  it("bresenhamLine should return a single point if start == end", () => {
    const result = cmath.raster.bresenham([0, 0], [0, 0]);
    expect(result).toEqual([[0, 0]]);
  });

  it("bresenhamLine should handle a horizontal line", () => {
    const result = cmath.raster.bresenham([0, 0], [3, 0]);
    // Expected pixels: (0,0), (1,0), (2,0), (3,0)
    expect(result).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  it("bresenhamLine should handle a vertical line", () => {
    const result = cmath.raster.bresenham([2, 2], [2, 5]);
    // Expected pixels: (2,2), (2,3), (2,4), (2,5)
    expect(result).toEqual([
      [2, 2],
      [2, 3],
      [2, 4],
      [2, 5],
    ]);
  });

  it("bresenhamLine should handle a diagonal line", () => {
    const result = cmath.raster.bresenham([0, 0], [3, 3]);
    // Expected pixels: (0,0), (1,1), (2,2), (3,3)
    expect(result).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });
});
