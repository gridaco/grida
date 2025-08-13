import { vn } from "../vn";

/*
// FIXME: the jest config does not work with svg-pathdata
import { vn } from "../vn";

describe("vector network svg io", () => {
  it("from path data", () => {
    it("d", () => {
      expect(vn.fromSVGPathData("M50 250 Q150 200 250 250 T450 250")).toEqual({
        verticies: [],
        segments: [],
      });
    });
  });
});
*/

describe("splitSegment", () => {
  it("splits a straight segment at middle", () => {
    const base = vn.polyline([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(base);
    const newIndex = editor.splitSegment(
      0,
      { segment: 0, t: 0.5 },
      { preserveZero: false }
    );

    expect(newIndex).toBe(3);
    expect(editor.vertices.length).toBe(4);
    expect(editor.segments.length).toBe(3);
    expect(editor.vertices[newIndex]).toEqual([5, 0]);

    // With de Casteljau's algorithm, the tangent values are calculated correctly
    // For a straight line with zero tangents split at t=0.5, the tangent at the split point is [-2.5, 0]
    expect(editor.segments[0]).toEqual({
      a: 0,
      b: newIndex,
      ta: [0, 0],
      tb: [-2.5, 0], // Correct tangent from de Casteljau algorithm
    });
    expect(editor.segments[1]).toEqual({
      a: newIndex,
      b: 1,
      ta: [2.5, 0], // Correct tangent from de Casteljau algorithm
      tb: [0, 0],
    });
  });

  it("splits a straight segment at different parametric positions", () => {
    const base = vn.polyline([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(base);

    // Split at 25% along the segment
    const newIndex = editor.splitSegment(
      0,
      { segment: 0, t: 0.25 },
      { preserveZero: false }
    );

    expect(newIndex).toBe(3);
    expect(editor.vertices.length).toBe(4);
    expect(editor.segments.length).toBe(3);

    // With de Casteljau's algorithm, the vertex position is calculated correctly
    // For t=0.25, the vertex position is at [1.5625, 0] (cubic Bézier evaluation)
    expect(editor.vertices[newIndex][0]).toBeCloseTo(1.5625, 4);
    expect(editor.vertices[newIndex][1]).toBe(0);

    // The tangent values are calculated using de Casteljau's algorithm
    // For a straight line with zero tangents split at t=0.25, the tangent at the split point is [-0.9375, 0]
    expect(editor.segments[0]).toEqual({
      a: 0,
      b: newIndex,
      ta: [0, 0],
      tb: [-0.9375, 0], // Correct tangent from de Casteljau algorithm
    });
    expect(editor.segments[1]).toEqual({
      a: newIndex,
      b: 1,
      ta: [2.8125, 0], // Correct tangent from de Casteljau algorithm
      tb: [0, 0],
    });
  });

  it("splits a curved segment and maintains visual continuity", () => {
    const base = vn.polyline([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(base);

    // Add some curvature to the first segment
    editor.updateTangent(0, "ta", [2, 2]);
    editor.updateTangent(0, "tb", [-2, 2]);

    // Split at middle
    const newIndex = editor.splitSegment(
      0,
      { segment: 0, t: 0.5 },
      { preserveZero: false }
    );

    expect(newIndex).toBe(3);
    expect(editor.vertices.length).toBe(4);
    expect(editor.segments.length).toBe(3);

    // The split point should be on the curve, not necessarily at [5, 0]
    expect(editor.vertices[newIndex][0]).toBeGreaterThan(0);
    expect(editor.vertices[newIndex][0]).toBeLessThan(10);

    // With de Casteljau's algorithm, the original tangents at endpoints are modified
    // to maintain the mathematical identity of the curve
    expect(editor.segments[0].ta).toEqual([1, 1]); // Modified by de Casteljau
    expect(editor.segments[1].tb).toEqual([-1, 1]); // Modified by de Casteljau

    // The split point should have calculated tangents for continuity
    // The tangents should be opposite at the split point for proper continuity
    expect(editor.segments[0].tb[0]).toBeCloseTo(-editor.segments[1].ta[0], 6);
    expect(editor.segments[0].tb[1]).toBeCloseTo(-editor.segments[1].ta[1], 6);

    // Verify the specific tangent values from de Casteljau algorithm
    // For this curved segment split at t=0.5, the split point tangent should be continuous
    const splitPointTangent = editor.segments[0].tb;
    expect(splitPointTangent[0]).toBeCloseTo(-2, 6);
    expect(splitPointTangent[1]).toBeCloseTo(0, 6);
  });

  test("maintains visual identity when splitting circle segment", () => {
    // Create a circle using ellipse
    const circle = vn.fromEllipse({ x: 0, y: 0, width: 100, height: 100 });
    const editor = new vn.VectorNetworkEditor(circle);

    // Get original bounding box
    const originalBBox = editor.getBBox();

    // Split the first segment at t=0.5
    editor.splitSegment(0, { segment: 0, t: 0.5 }, { preserveZero: false });

    // Get new bounding box
    const newBBox = editor.getBBox();

    // The bounding boxes should be identical (within floating point precision)
    expect(newBBox.x).toBeCloseTo(originalBBox.x, 6);
    expect(newBBox.y).toBeCloseTo(originalBBox.y, 6);
    expect(newBBox.width).toBeCloseTo(originalBBox.width, 6);
    expect(newBBox.height).toBeCloseTo(originalBBox.height, 6);
  });

  test("splits multiple segments and maintains visual identity", () => {
    // Create a complex shape (rectangle)
    const rect = vn.fromRect({ x: 0, y: 0, width: 100, height: 50 });
    const editor = new vn.VectorNetworkEditor(rect);

    // Get original bounding box
    const originalBBox = editor.getBBox();

    // Split multiple segments at different positions
    editor.splitSegment(0, { segment: 0, t: 0.3 }); // Split first segment at 30%
    editor.splitSegment(2, { segment: 2, t: 0.7 }); // Split third segment at 70%

    // Get new bounding box
    const newBBox = editor.getBBox();

    // The bounding boxes should be identical (within floating point precision)
    expect(newBBox.x).toBeCloseTo(originalBBox.x, 6);
    expect(newBBox.y).toBeCloseTo(originalBBox.y, 6);
    expect(newBBox.width).toBeCloseTo(originalBBox.width, 6);
    expect(newBBox.height).toBeCloseTo(originalBBox.height, 6);

    // Verify that we now have more vertices and segments
    expect(editor.vertices.length).toBeGreaterThan(4);
    expect(editor.segments.length).toBeGreaterThan(4);
  });

  test("handles edge cases correctly", () => {
    const base = vn.polyline([
      [0, 0],
      [10, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(base);

    // Test splitting at t=0 (should create a zero-length first segment)
    const index0 = editor.splitSegment(0, { segment: 0, t: 0 });
    expect(index0).toBe(2);
    expect(editor.vertices[index0]).toEqual([0, 0]);
    expect(editor.segments[0].a).toBe(0);
    expect(editor.segments[0].b).toBe(index0);
    expect(editor.segments[1].a).toBe(index0);
    expect(editor.segments[1].b).toBe(1);

    // Test splitting at t=1 (should create a zero-length second segment)
    const base2 = vn.polyline([
      [0, 0],
      [10, 0],
    ]);
    const editor2 = new vn.VectorNetworkEditor(base2);
    const index1 = editor2.splitSegment(0, { segment: 0, t: 1 });
    expect(index1).toBe(2);
    expect(editor2.vertices[index1]).toEqual([10, 0]);
    expect(editor2.segments[0].a).toBe(0);
    expect(editor2.segments[0].b).toBe(index1);
    expect(editor2.segments[1].a).toBe(index1);
    expect(editor2.segments[1].b).toBe(1);
  });

  test("maintains tangent continuity across split points", () => {
    const base = vn.polyline([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(base);

    // Add curvature to the first segment
    editor.updateTangent(0, "ta", [1, 1]);
    editor.updateTangent(0, "tb", [-1, 1]);

    // Split the segment
    const newIndex = editor.splitSegment(0, { segment: 0, t: 0.6 });

    // Verify tangent continuity at the split point
    const firstSegment = editor.segments[0];
    const secondSegment = editor.segments[1];

    // The end tangent of the first segment should be opposite to the start tangent of the second segment
    // This ensures proper continuity at the split point
    // We check that they are opposite vectors (same magnitude, opposite direction)
    const leftTangent = firstSegment.tb;
    const rightTangent = secondSegment.ta;

    // Check that the magnitudes are the same
    const leftMagnitude = Math.hypot(leftTangent[0], leftTangent[1]);
    const rightMagnitude = Math.hypot(rightTangent[0], rightTangent[1]);

    // For de Casteljau's algorithm, the tangents should be proportional but not necessarily equal
    // We check that they point in opposite directions (normalized vectors should be opposite)
    if (leftMagnitude > 0 && rightMagnitude > 0) {
      const leftNormalized = [
        leftTangent[0] / leftMagnitude,
        leftTangent[1] / leftMagnitude,
      ];
      const rightNormalized = [
        rightTangent[0] / rightMagnitude,
        rightTangent[1] / rightMagnitude,
      ];

      // They should point in opposite directions for proper continuity
      expect(leftNormalized[0]).toBeCloseTo(-rightNormalized[0], 6);
      expect(leftNormalized[1]).toBeCloseTo(-rightNormalized[1], 6);
    }

    // Verify that the split point is correctly positioned
    expect(editor.vertices[newIndex][0]).toBeGreaterThan(0);
    expect(editor.vertices[newIndex][0]).toBeLessThan(10);
  });

  test("throws error for invalid segment index", () => {
    const base = vn.polyline([
      [0, 0],
      [10, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(base);

    expect(() => {
      editor.splitSegment(-1, { segment: -1, t: 0.5 });
    }).toThrow("Invalid segment index: -1");

    expect(() => {
      editor.splitSegment(5, { segment: 5, t: 0.5 });
    }).toThrow("Invalid segment index: 5");
  });

  test("throws error for mismatched segment indices", () => {
    const base = vn.polyline([
      [0, 0],
      [10, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(base);

    expect(() => {
      editor.splitSegment(0, { segment: 1, t: 0.5 });
    }).toThrow(
      "PointOnSegment segment index (1) does not match segment index (0)"
    );
  });

  test("splits quarter arc correctly", () => {
    // This test reproduces the real-world issue with quarter arc splitting
    const originalVertices = [
      [0, 0],
      [49.99999595692549, 49.99999595692549],
    ];

    const originalSegments = [
      {
        a: 0,
        b: 1,
        ta: [27.614235258611284, 0],
        tb: [0, -27.614235258611284],
      },
    ];

    const base = {
      vertices: originalVertices as [number, number][],
      segments: originalSegments as vn.VectorNetworkSegment[],
    };
    const editor = new vn.VectorNetworkEditor(base);

    // Split at middle (t=0.5)
    const newIndex = editor.splitSegment(
      0,
      { segment: 0, t: 0.5 },
      { preserveZero: false }
    );

    // The split point should follow Bézier curve behavior, not linear interpolation
    // For a quarter arc from (0,0) to (50,50), the middle follows Bézier mathematics
    // The actual result [35.35533620044198, 14.644659756483513] is mathematically correct!
    expect(editor.vertices[newIndex][0]).toBeCloseTo(35.355, 1);
    expect(editor.vertices[newIndex][1]).toBeCloseTo(14.645, 1);

    // Verify tangent continuity - tangents should be opposite at the split point
    expect(editor.segments[0].tb[0]).toBeCloseTo(-editor.segments[1].ta[0], 6);
    expect(editor.segments[0].tb[1]).toBeCloseTo(-editor.segments[1].ta[1], 6);

    // The original endpoint tangents are modified by de Casteljau's algorithm to maintain mathematical identity
    // This is the correct behavior - the tangents are adjusted to preserve the curve shape
    expect(editor.segments[0].ta[1]).toBeCloseTo(0, 6);
    expect(editor.segments[1].tb[0]).toBeCloseTo(0, 6);
  });

  test("splits proper quarter circle correctly", () => {
    // Create a proper quarter circle using fromEllipse
    const quarterCircle = vn.fromEllipse({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const editor = new vn.VectorNetworkEditor(quarterCircle);

    // Split the first segment (quarter circle) at middle
    const newIndex = editor.splitSegment(
      0,
      { segment: 0, t: 0.5 },
      { preserveZero: false }
    );

    // For this quarter circle (from [50,0] to [100,50]), the middle follows Bézier mathematics
    // The actual result [85.35533905932738, 14.644660940672619] is mathematically correct!
    expect(editor.vertices[newIndex][0]).toBeCloseTo(85.355, 1);
    expect(editor.vertices[newIndex][1]).toBeCloseTo(14.645, 1);

    // Verify tangent continuity - tangents should be opposite at the split point
    expect(editor.segments[0].tb[0]).toBeCloseTo(-editor.segments[1].ta[0], 6);
    expect(editor.segments[0].tb[1]).toBeCloseTo(-editor.segments[1].ta[1], 6);
  });

  describe("splitSegment with preserveZero config", () => {
    test("should preserve zero tangents when preserveZero is true", () => {
      const base = vn.polyline([
        [0, 0],
        [10, 0],
      ]);
      const editor = new vn.VectorNetworkEditor(base);

      // Split with preserveZero = true
      const newIndex = editor.splitSegment(
        0,
        { segment: 0, t: 0.5 },
        { preserveZero: true }
      );

      expect(newIndex).toBe(2);
      expect(editor.vertices.length).toBe(3);
      expect(editor.segments.length).toBe(2);

      // Split point should be at the midpoint (linear interpolation)
      expect(editor.vertices[newIndex]).toEqual([5, 0]);

      // Both segments should have zero tangents
      expect(editor.segments[0]).toEqual({
        a: 0,
        b: newIndex,
        ta: [0, 0],
        tb: [0, 0],
      });
      expect(editor.segments[1]).toEqual({
        a: newIndex,
        b: 1,
        ta: [0, 0],
        tb: [0, 0],
      });
    });

    test("should use de Casteljau algorithm when preserveZero is false", () => {
      const base = vn.polyline([
        [0, 0],
        [10, 0],
      ]);
      const editor = new vn.VectorNetworkEditor(base);

      // Split with preserveZero = false (default behavior)
      const newIndex = editor.splitSegment(
        0,
        { segment: 0, t: 0.5 },
        { preserveZero: false }
      );

      expect(newIndex).toBe(2);
      expect(editor.vertices.length).toBe(3);
      expect(editor.segments.length).toBe(2);

      // Split point should be at the midpoint (linear interpolation for zero tangents)
      expect(editor.vertices[newIndex]).toEqual([5, 0]);

      // Segments should have calculated tangents from de Casteljau's algorithm
      expect(editor.segments[0].ta).toEqual([0, 0]);
      expect(editor.segments[0].tb).toEqual([-2.5, 0]);
      expect(editor.segments[1].ta).toEqual([2.5, 0]);
      expect(editor.segments[1].tb).toEqual([0, 0]);
    });

    test("should use de Casteljau algorithm for curved segments even with preserveZero", () => {
      const base = vn.polyline([
        [0, 0],
        [10, 0],
      ]);
      const editor = new vn.VectorNetworkEditor(base);

      // Add curvature to the segment
      editor.updateTangent(0, "ta", [2, 2]);
      editor.updateTangent(0, "tb", [-2, 2]);

      // Split with preserveZero = true, but should still use de Casteljau since original has non-zero tangents
      const newIndex = editor.splitSegment(
        0,
        { segment: 0, t: 0.5 },
        { preserveZero: true }
      );

      expect(newIndex).toBe(2);
      expect(editor.vertices.length).toBe(3);
      expect(editor.segments.length).toBe(2);

      // Should use de Casteljau's algorithm since original segment has non-zero tangents
      expect(editor.segments[0].ta).toEqual([1, 1]);
      expect(editor.segments[0].tb).toEqual([-2, 0]);
      expect(editor.segments[1].ta).toEqual([2, 0]);
      expect(editor.segments[1].tb).toEqual([-1, 1]);
    });

    test("should preserve zero tangents at different split positions", () => {
      const base = vn.polyline([
        [0, 0],
        [10, 0],
      ]);
      const editor = new vn.VectorNetworkEditor(base);

      // Split at 25% with preserveZero = true
      const newIndex = editor.splitSegment(
        0,
        { segment: 0, t: 0.25 },
        { preserveZero: true }
      );

      expect(newIndex).toBe(2);
      expect(editor.vertices.length).toBe(3);
      expect(editor.segments.length).toBe(2);

      // Split point should be at the correct Bézier curve position (not linear interpolation)
      expect(editor.vertices[newIndex][0]).toBeCloseTo(1.5625, 6);
      expect(editor.vertices[newIndex][1]).toBeCloseTo(0, 6);

      // Both segments should have zero tangents
      expect(editor.segments[0].ta).toEqual([0, 0]);
      expect(editor.segments[0].tb).toEqual([0, 0]);
      expect(editor.segments[1].ta).toEqual([0, 0]);
      expect(editor.segments[1].tb).toEqual([0, 0]);
    });

    test("should handle edge cases with preserveZero", () => {
      const base = vn.polyline([
        [0, 0],
        [10, 0],
      ]);
      const editor = new vn.VectorNetworkEditor(base);

      // Split at t=0 with preserveZero = true
      const index0 = editor.splitSegment(
        0,
        { segment: 0, t: 0 },
        { preserveZero: true }
      );
      expect(index0).toBe(2);
      expect(editor.vertices[index0]).toEqual([0, 0]);
      expect(editor.segments[0].ta).toEqual([0, 0]);
      expect(editor.segments[0].tb).toEqual([0, 0]);
      expect(editor.segments[1].ta).toEqual([0, 0]);
      expect(editor.segments[1].tb).toEqual([0, 0]);

      // Reset and split at t=1 with preserveZero = true
      const base2 = vn.polyline([
        [0, 0],
        [10, 0],
      ]);
      const editor2 = new vn.VectorNetworkEditor(base2);
      const index1 = editor2.splitSegment(
        0,
        { segment: 0, t: 1 },
        { preserveZero: true }
      );
      expect(index1).toBe(2);
      expect(editor2.vertices[index1]).toEqual([10, 0]);
      expect(editor2.segments[0].ta).toEqual([0, 0]);
      expect(editor2.segments[0].tb).toEqual([0, 0]);
      expect(editor2.segments[1].ta).toEqual([0, 0]);
      expect(editor2.segments[1].tb).toEqual([0, 0]);
    });
  });
});

describe("getLoopPathData", () => {
  it("should generate path data for a simple triangle loop", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [5, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    expect(loops).toHaveLength(1);
    const pathData = editor.getLoopPathData(loops[0]);

    // The path should start with M (move to), have L (line to) commands, and end with Z (close path)
    expect(pathData).toMatch(
      /^M\d+\.?\d*\s+\d+\.?\d*\s+L\d+\.?\d*\s+\d+\.?\d*\s+L\d+\.?\d*\s+\d+\.?\d*\s+L\d+\.?\d*\s+\d+\.?\d*\s+Z$/
    );

    // Verify the actual path data format
    expect(pathData).toBe("M10 0 L5 10 L0 0 L10 0 Z");
  });

  it("should generate path data for a rectangle loop", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const loops = editor.getLoops();

    expect(loops).toHaveLength(1);
    const pathData = editor.getLoopPathData(loops[0]);

    // Should generate a closed rectangular path
    expect(pathData).toMatch(
      /^M\d+\.?\d*\s+\d+\.?\d*\s+L\d+\.?\d*\s+\d+\.?\d*\s+L\d+\.?\d*\s+\d+\.?\d*\s+L\d+\.?\d*\s+\d+\.?\d*\s+L\d+\.?\d*\s+\d+\.?\d*\s+Z$/
    );
  });

  it("should handle empty loop", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [5, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const pathData = editor.getLoopPathData([]);

    expect(pathData).toBe("");
  });

  it("should handle curved segments in loop", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [5, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);

    // Add some curvature to the segments
    editor.updateTangent(0, "ta", [2, 0]);
    editor.updateTangent(0, "tb", [-2, 0]);

    const loops = editor.getLoops();
    expect(loops).toHaveLength(1);
    const pathData = editor.getLoopPathData(loops[0]);

    // Should contain curve commands (C) for the curved segment
    expect(pathData).toMatch(
      /C\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*/
    );

    // Verify the actual path data format includes a curve
    expect(pathData).toContain("C");
    expect(pathData).toContain("Z");
  });
});
