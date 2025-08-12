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
  it("returns empty array for a simple polyline", () => {
    const net = vn.polyline([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    expect(loops).toEqual([]);
  });

  it("returns single loop for a simple polygon", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    expect(loops).toHaveLength(1);
    expect(loops[0]).toEqual([0, 1, 2, 3]); // segment indices forming the loop
  });

  it("returns single loop for a triangle", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [5, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    expect(loops).toHaveLength(1);
    expect(loops[0]).toEqual([0, 1, 2]); // segment indices forming the triangle
  });

  it("returns multiple loops for disconnected polygons", () => {
    // Create a network with two separate squares by manually adding segments
    const editor = new vn.VectorNetworkEditor({
      vertices: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10], // First square vertices
        [20, 0],
        [30, 0],
        [30, 10],
        [20, 10], // Second square vertices
      ],
      segments: [
        // First square segments
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 1, b: 2, ta: [0, 0], tb: [0, 0] },
        { a: 2, b: 3, ta: [0, 0], tb: [0, 0] },
        { a: 3, b: 0, ta: [0, 0], tb: [0, 0] },
        // Second square segments
        { a: 4, b: 5, ta: [0, 0], tb: [0, 0] },
        { a: 5, b: 6, ta: [0, 0], tb: [0, 0] },
        { a: 6, b: 7, ta: [0, 0], tb: [0, 0] },
        { a: 7, b: 4, ta: [0, 0], tb: [0, 0] },
      ],
    });

    const loops = editor.getLoops();

    expect(loops).toHaveLength(2);
    // First square: segments 0, 1, 2, 3
    expect(loops[0]).toEqual([0, 1, 2, 3]);
    // Second square: segments 4, 5, 6, 7
    expect(loops[1]).toEqual([4, 5, 6, 7]);
  });

  it("ignores segments that don't form closed loops", () => {
    // Create a polygon with an extra dangling segment
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);

    // Add a dangling segment by adding a new vertex and segment
    editor.addVertex([20, 20]);
    editor.addSegment(0, 4); // Connect vertex 0 to the new vertex 4

    const loops = editor.getLoops();

    expect(loops).toHaveLength(1);
    expect(loops[0]).toEqual([0, 1, 2, 3]); // Only the closed loop, not the dangling segment
  });

  it("handles complex nested loops", () => {
    // Create a donut shape using two concentric rectangles
    const editor = new vn.VectorNetworkEditor({
      vertices: [
        // Outer rectangle
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
        // Inner rectangle
        [5, 5],
        [15, 5],
        [15, 15],
        [5, 15],
      ],
      segments: [
        // Outer rectangle segments
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 1, b: 2, ta: [0, 0], tb: [0, 0] },
        { a: 2, b: 3, ta: [0, 0], tb: [0, 0] },
        { a: 3, b: 0, ta: [0, 0], tb: [0, 0] },
        // Inner rectangle segments
        { a: 4, b: 5, ta: [0, 0], tb: [0, 0] },
        { a: 5, b: 6, ta: [0, 0], tb: [0, 0] },
        { a: 6, b: 7, ta: [0, 0], tb: [0, 0] },
        { a: 7, b: 4, ta: [0, 0], tb: [0, 0] },
      ],
    });

    const loops = editor.getLoops();

    expect(loops).toHaveLength(2);
    // Both loops should be closed
    expect(loops[0].length).toBeGreaterThan(0);
    expect(loops[1].length).toBeGreaterThan(0);

    // Verify that the loops are actually closed by checking connectivity
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i++) {
        const currentSeg = editor.segments[loop[i]];
        const nextSeg = editor.segments[loop[(i + 1) % loop.length]];
        expect(currentSeg.b).toBe(nextSeg.a);
      }
    }
  });

  it("returns segment indices, not vertex indices", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    expect(loops).toHaveLength(1);
    const loop = loops[0];

    // Verify that we're getting segment indices, not vertex indices
    for (const segIndex of loop) {
      expect(segIndex).toBeGreaterThanOrEqual(0);
      expect(segIndex).toBeLessThan(editor.segments.length);
      expect(editor.segments[segIndex]).toBeDefined();
    }
  });

  it("handles self-intersecting shapes correctly", () => {
    // Create a figure-8 shape or similar self-intersecting polygon
    const net = vn.polygon([
      [0, 0],
      [10, 10],
      [0, 10],
      [10, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    // Should still return valid loops
    expect(loops.length).toBeGreaterThan(0);

    for (const loop of loops) {
      expect(loop.length).toBeGreaterThan(0);
      // Each segment index should be valid
      for (const segIndex of loop) {
        expect(segIndex).toBeGreaterThanOrEqual(0);
        expect(segIndex).toBeLessThan(editor.segments.length);
      }
    }
  });

  it("works with curved segments", () => {
    // Create a shape with curved segments
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);

    // Add some curvature to the segments
    editor.segments[0].ta = [2, 0];
    editor.segments[0].tb = [-2, 0];
    editor.segments[1].ta = [0, 2];
    editor.segments[1].tb = [0, -2];

    const loops = editor.getLoops();

    expect(loops).toHaveLength(1);
    expect(loops[0]).toEqual([0, 1, 2, 3]); // Should still return the same segment indices
  });

  it("handles empty vector network", () => {
    const net = vn.polyline([]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    expect(loops).toEqual([]);
  });

  it("handles single vertex network", () => {
    const net = vn.polyline([[0, 0]]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    expect(loops).toEqual([]);
  });

  it("demonstrates the difference between old and new implementation", () => {
    // This test shows that the new implementation returns segment indices
    // instead of resolved Vector2 points
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    expect(loops).toHaveLength(1);
    const loop = loops[0];

    // New implementation: returns segment indices
    expect(loop).toEqual([0, 1, 2, 3]);

    // Verify these are actually segment indices by checking the segments
    expect(editor.segments[loop[0]]).toEqual({
      a: 0,
      b: 1,
      ta: [0, 0],
      tb: [0, 0],
    });
    expect(editor.segments[loop[1]]).toEqual({
      a: 1,
      b: 2,
      ta: [0, 0],
      tb: [0, 0],
    });
    expect(editor.segments[loop[2]]).toEqual({
      a: 2,
      b: 3,
      ta: [0, 0],
      tb: [0, 0],
    });
    expect(editor.segments[loop[3]]).toEqual({
      a: 3,
      b: 0,
      ta: [0, 0],
      tb: [0, 0],
    });

    // Old implementation would have returned:
    // [[0, 0], [10, 0], [10, 10], [0, 10]]
    // New implementation returns segment indices that can be used to resolve points when needed
  });
});
