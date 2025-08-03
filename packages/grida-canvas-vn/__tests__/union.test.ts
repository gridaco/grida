import { vn } from "../vn";

describe("VectorNetworkEditor.union", () => {
  it("merges networks while deduplicating vertices", () => {
    const netA = vn.polyline([
      [0, 0],
      [10, 0],
    ]);
    const netB = vn.polyline([
      [10, 0],
      [20, 0],
    ]);

    const result = vn.VectorNetworkEditor.union(netA, netB);

    expect(result.vertices.map((v) => v.p)).toEqual([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    expect(result.segments).toEqual([
      { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
      { a: 1, b: 2, ta: [0, 0], tb: [0, 0] },
    ]);
  });

  it("removes duplicate segments", () => {
    const netA = vn.polyline([
      [0, 0],
      [10, 0],
    ]);
    const netB = vn.polyline([
      [0, 0],
      [10, 0],
    ]);

    const result = vn.VectorNetworkEditor.union(netA, netB);

    expect(result.vertices.map((v) => v.p)).toEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(result.segments).toEqual([
      { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
    ]);
  });
});
