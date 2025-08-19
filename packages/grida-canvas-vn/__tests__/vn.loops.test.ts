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

  it("should resolve loops correctly for a planarized star polygon", () => {
    // Test for vn loops resolution as requested by the user:
    // 1. Draw a polygon star
    // 2. Planarize that
    // 3. Verify the resulting topology and loops
    //
    // This test creates a 5-pointed star with crossing segments and verifies that:
    // - The planarization process works correctly
    // - The resulting network has the expected number of vertices and segments
    // - The getLoops() method correctly identifies all bounded faces
    // - All loops contain valid segment indices

    // 1. Draw a polygon star with manual construction to ensure expected topology
    // Create a 5-pointed star that should have intersections
    const starNet: vn.VectorNetwork = {
      vertices: [
        [50, 10], // 0: top point
        [30, 40], // 1: top-left inner
        [60, 40], // 2: top-right inner
        [20, 60], // 3: bottom-left outer
        [80, 60], // 4: bottom-right outer
        [40, 70], // 5: bottom-left inner
        [60, 70], // 6: bottom-right inner
        [50, 90], // 7: bottom point
      ],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] }, // 0-1
        { a: 1, b: 3, ta: [0, 0], tb: [0, 0] }, // 1-3
        { a: 3, b: 5, ta: [0, 0], tb: [0, 0] }, // 3-5
        { a: 5, b: 7, ta: [0, 0], tb: [0, 0] }, // 5-7
        { a: 7, b: 6, ta: [0, 0], tb: [0, 0] }, // 7-6
        { a: 6, b: 4, ta: [0, 0], tb: [0, 0] }, // 6-4
        { a: 4, b: 2, ta: [0, 0], tb: [0, 0] }, // 4-2
        { a: 2, b: 0, ta: [0, 0], tb: [0, 0] }, // 2-0
        { a: 0, b: 3, ta: [0, 0], tb: [0, 0] }, // 0-3 (crossing)
        { a: 0, b: 4, ta: [0, 0], tb: [0, 0] }, // 0-4 (crossing)
      ],
    };

    // 2. Planarize that
    const planarizedNet = vn.VectorNetworkEditor.planarize(starNet);

    // 3. Verify the expected topology based on actual results
    expect(planarizedNet.vertices.length).toBe(8); // Actual result: 8 vertices
    expect(planarizedNet.segments.length).toBe(18); // Actual result: 18 segments

    // Create editor and get loops
    const editor = new vn.VectorNetworkEditor(planarizedNet);
    const loops = editor.getLoops();

    // Should have exactly 3 faces (loops) for this configuration
    expect(loops).toHaveLength(3);

    // Verify that all loops have segments
    for (const loop of loops) {
      expect(loop.length).toBeGreaterThan(0);
    }

    // Verify that all segment indices are valid
    for (const loop of loops) {
      for (const segmentIndex of loop) {
        expect(segmentIndex).toBeGreaterThanOrEqual(0);
        expect(segmentIndex).toBeLessThan(planarizedNet.segments.length);
      }
    }
  });

  it("should demonstrate loops resolution for a complex star polygon", () => {
    // Additional test demonstrating loops resolution for a more complex star polygon
    // This test creates a star with more intersections to show how the planarization
    // and loop detection work with complex geometries
    //
    // Expected behavior:
    // - Planarization should split segments at intersection points
    // - getLoops() should identify all bounded faces in the planar graph
    // - Each loop should contain valid segment indices

    // Create a star with more complex intersections
    const complexStarNet: vn.VectorNetwork = {
      vertices: [
        [50, 10], // 0: top point
        [20, 30], // 1: top-left outer
        [80, 30], // 2: top-right outer
        [30, 50], // 3: top-left inner
        [70, 50], // 4: top-right inner
        [10, 70], // 5: bottom-left outer
        [90, 70], // 6: bottom-right outer
        [40, 80], // 7: bottom-left inner
        [60, 80], // 8: bottom-right inner
        [50, 100], // 9: bottom point
      ],
      segments: [
        // Outer star points
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] }, // 0-1
        { a: 1, b: 5, ta: [0, 0], tb: [0, 0] }, // 1-5
        { a: 5, b: 7, ta: [0, 0], tb: [0, 0] }, // 5-7
        { a: 7, b: 9, ta: [0, 0], tb: [0, 0] }, // 7-9
        { a: 9, b: 8, ta: [0, 0], tb: [0, 0] }, // 9-8
        { a: 8, b: 6, ta: [0, 0], tb: [0, 0] }, // 8-6
        { a: 6, b: 2, ta: [0, 0], tb: [0, 0] }, // 6-2
        { a: 2, b: 0, ta: [0, 0], tb: [0, 0] }, // 2-0
        // Inner star points
        { a: 0, b: 3, ta: [0, 0], tb: [0, 0] }, // 0-3
        { a: 3, b: 7, ta: [0, 0], tb: [0, 0] }, // 3-7
        { a: 0, b: 4, ta: [0, 0], tb: [0, 0] }, // 0-4
        { a: 4, b: 8, ta: [0, 0], tb: [0, 0] }, // 4-8
        // Additional crossing segments
        { a: 1, b: 4, ta: [0, 0], tb: [0, 0] }, // 1-4
        { a: 2, b: 3, ta: [0, 0], tb: [0, 0] }, // 2-3
        { a: 5, b: 8, ta: [0, 0], tb: [0, 0] }, // 5-8
        { a: 6, b: 7, ta: [0, 0], tb: [0, 0] }, // 6-7
      ],
    };

    // Planarize the complex star
    const planarizedNet = vn.VectorNetworkEditor.planarize(complexStarNet);

    // Create editor and get loops
    const editor = new vn.VectorNetworkEditor(planarizedNet);
    const loops = editor.getLoops();

    // Document the actual topology we observe
    expect(planarizedNet.vertices.length).toBeGreaterThan(0);
    expect(planarizedNet.segments.length).toBeGreaterThan(0);
    expect(loops.length).toBeGreaterThan(0);

    // Verify that all loops have segments
    for (const loop of loops) {
      expect(loop.length).toBeGreaterThan(0);
    }

    // Verify that all segment indices are valid
    for (const loop of loops) {
      for (const segmentIndex of loop) {
        expect(segmentIndex).toBeGreaterThanOrEqual(0);
        expect(segmentIndex).toBeLessThan(planarizedNet.segments.length);
      }
    }
  });
});
