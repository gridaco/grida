import { vn } from "../vn";

describe("VectorNetworkEditor isLoopClosed", () => {
  it("returns true for a closed polygon", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    expect(editor.isLoopClosed([0, 1, 2, 3])).toBe(true);
  });

  it("returns false for an open polyline", () => {
    const net = vn.polyline([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    expect(editor.isLoopClosed([0, 1])).toBe(false);
  });

  it("returns false when segments are not sequential", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    expect(editor.isLoopClosed([0, 2, 1, 3])).toBe(false);
  });
});

describe("VectorNetworkEditor getLoops", () => {
  it("golden: a single straight segment should have no loop", () => {
    const net = vn.polyline([
      [0, 0],
      [10, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    expect(loops).toEqual([]);
  });

  it("golden: a closed triangle should have exactly one loop", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [5, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    expect(loops).toHaveLength(1);
    expect(loops[0]).toEqual([1, 2, 0]); // segment indices forming the triangle
  });

  it("golden: two triangles sharing exactly one vertex should have 2 loops", () => {
    const editor = new vn.VectorNetworkEditor({
      vertices: [
        [0, 0], // 0 - shared vertex
        [10, 0], // 1 - first triangle
        [5, 10], // 2 - first triangle
        [20, 0], // 3 - second triangle
        [15, 10], // 4 - second triangle
      ],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] }, // 0-1
        { a: 1, b: 2, ta: [0, 0], tb: [0, 0] }, // 1-2
        { a: 2, b: 0, ta: [0, 0], tb: [0, 0] }, // 2-0
        { a: 0, b: 3, ta: [0, 0], tb: [0, 0] }, // 0-3
        { a: 3, b: 4, ta: [0, 0], tb: [0, 0] }, // 3-4
        { a: 4, b: 0, ta: [0, 0], tb: [0, 0] }, // 4-0
      ],
    });

    const loops = editor.getLoops();
    expect(loops).toHaveLength(2);

    // Verify loops are closed and contain expected segments
    const loopSets = loops.map((loop) => new Set(loop));
    expect(
      loopSets.some((loop) => loop.has(0) && loop.has(1) && loop.has(2))
    ).toBe(true);
    expect(
      loopSets.some((loop) => loop.has(3) && loop.has(4) && loop.has(5))
    ).toBe(true);
  });
});
