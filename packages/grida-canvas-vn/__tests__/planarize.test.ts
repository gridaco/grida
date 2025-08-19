import { vn } from "../vn";

describe("vn.VectorNetworkEditor.planarize", () => {
  test("should handle simple crossing segments", () => {
    // Create a network with two crossing diagonal segments
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0: top-left
        [100, 100], // 1: bottom-right
        [0, 100], // 2: bottom-left
        [100, 0], // 3: top-right
      ],
      segments: [
        {
          a: 0, // from top-left
          b: 1, // to bottom-right
          ta: [0, 0],
          tb: [0, 0],
        },
        {
          a: 2, // from bottom-left
          b: 3, // to top-right
          ta: [0, 0],
          tb: [0, 0],
        },
      ],
    };

    const planarized = vn.VectorNetworkEditor.planarize(network);

    // Should have more vertices (intersection point added)
    expect(planarized.vertices.length).toBeGreaterThan(network.vertices.length);

    // Should have more segments (each segment split at intersection)
    expect(planarized.segments.length).toBeGreaterThan(network.segments.length);

    // Should have exactly 5 vertices (original 4 + 1 intersection)
    expect(planarized.vertices.length).toBe(5);

    // Should have exactly 4 segments (each original segment split into 2)
    expect(planarized.segments.length).toBe(4);

    // Check that the intersection point is at (50, 50)
    const intersectionVertex = planarized.vertices.find(
      (v) => Math.abs(v[0] - 50) < 1e-3 && Math.abs(v[1] - 50) < 1e-3
    );
    expect(intersectionVertex).toBeDefined();
  });

  test("should handle networks with no intersections", () => {
    // Create a network with parallel segments
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0
        [100, 0], // 1
        [0, 50], // 2
        [100, 50], // 3
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [0, 0],
          tb: [0, 0],
        },
        {
          a: 2,
          b: 3,
          ta: [0, 0],
          tb: [0, 0],
        },
      ],
    };

    const planarized = vn.VectorNetworkEditor.planarize(network);

    // Should remain unchanged
    expect(planarized.vertices.length).toBe(network.vertices.length);
    expect(planarized.segments.length).toBe(network.segments.length);
  });

  test("should handle single segment", () => {
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0],
        [100, 0],
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [0, 0],
          tb: [0, 0],
        },
      ],
    };

    const planarized = vn.VectorNetworkEditor.planarize(network);

    // Should remain unchanged
    expect(planarized.vertices.length).toBe(network.vertices.length);
    expect(planarized.segments.length).toBe(network.segments.length);
  });

  test("should handle empty network", () => {
    const network: vn.VectorNetwork = {
      vertices: [],
      segments: [],
    };

    const planarized = vn.VectorNetworkEditor.planarize(network);

    // Should remain unchanged
    expect(planarized.vertices.length).toBe(0);
    expect(planarized.segments.length).toBe(0);
  });

  test("should handle curved segments with intersections", () => {
    // Create curved segments that definitely intersect
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0
        [100, 100], // 1
        [0, 100], // 2
        [100, 0], // 3
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [25, 25], // curve slightly
          tb: [-25, -25],
        },
        {
          a: 2,
          b: 3,
          ta: [25, -25], // curve slightly
          tb: [-25, 25],
        },
      ],
    };

    const planarized = vn.VectorNetworkEditor.planarize(network);

    // Should have more vertices and segments due to intersection
    expect(planarized.vertices.length).toBeGreaterThan(network.vertices.length);
    expect(planarized.segments.length).toBeGreaterThan(network.segments.length);
  });

  test("should handle self-intersecting segments", () => {
    // Create a curve that actually self-intersects
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0: start point
        [100, 0], // 1: end point
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [200, 200], // control point 1 (creates upward loop)
          tb: [-100, 200], // control point 2 (creates downward loop)
        },
      ],
    };

    const planarized = vn.VectorNetworkEditor.planarize(network);

    // Should have more vertices due to self-intersection
    expect(planarized.vertices.length).toBeGreaterThan(network.vertices.length);
    expect(planarized.segments.length).toBeGreaterThan(network.segments.length);

    // Should have exactly 3 vertices (original 2 + 1 intersection point)
    expect(planarized.vertices.length).toBe(3);

    // Should have exactly 3 segments (original segment split into 3 parts)
    expect(planarized.segments.length).toBe(3);

    // Check that the intersection point is at the expected location
    // The curve should intersect at approximately (71.4, 85.7)
    const intersectionVertex = planarized.vertices.find(
      (v) => Math.abs(v[0] - 71.4) < 1 && Math.abs(v[1] - 85.7) < 1
    );
    expect(intersectionVertex).toBeDefined();
  });

  test("should handle self-intersecting segments with different parameters", () => {
    // Create another self-intersecting curve with different parameters
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0: start point
        [50, 0], // 1: end point
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [100, 150], // different control points
          tb: [-50, 150],
        },
      ],
    };

    const planarized = vn.VectorNetworkEditor.planarize(network);

    // Should have more vertices and segments due to self-intersection
    expect(planarized.vertices.length).toBeGreaterThan(network.vertices.length);
    expect(planarized.segments.length).toBeGreaterThan(network.segments.length);

    // Should have exactly 3 vertices (original 2 + 1 intersection point)
    expect(planarized.vertices.length).toBe(3);

    // Should have exactly 3 segments (original segment split into 3 parts)
    expect(planarized.segments.length).toBe(3);
  });

  test("should handle segments without self-intersections", () => {
    // Create a simple curve that doesn't self-intersect
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0: start point
        [100, 0], // 1: end point
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [50, 25], // control point that doesn't create self-intersection
          tb: [-50, 25],
        },
      ],
    };

    const planarized = vn.VectorNetworkEditor.planarize(network);

    // Should remain unchanged (no self-intersection)
    expect(planarized.vertices.length).toBe(network.vertices.length);
    expect(planarized.segments.length).toBe(network.segments.length);
  });

  test("should handle straight segments (no self-intersection)", () => {
    // Create a straight line segment
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0: start point
        [100, 0], // 1: end point
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [0, 0], // zero tangents = straight line
          tb: [0, 0],
        },
      ],
    };

    const planarized = vn.VectorNetworkEditor.planarize(network);

    // Should remain unchanged (no self-intersection possible)
    expect(planarized.vertices.length).toBe(network.vertices.length);
    expect(planarized.segments.length).toBe(network.segments.length);
  });

  test("should handle both self-intersections and cross-intersections", () => {
    // Create a network with both self-intersecting and cross-intersecting segments
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0: start of self-intersecting curve
        [100, 0], // 1: end of self-intersecting curve
        [50, 50], // 2: start of crossing line
        [50, -50], // 3: end of crossing line
      ],
      segments: [
        {
          a: 0,
          b: 1, // self-intersecting curve
          ta: [200, 200],
          tb: [-100, 200],
        },
        {
          a: 2,
          b: 3, // straight line that crosses the self-intersecting curve
          ta: [0, 0],
          tb: [0, 0],
        },
      ],
    };

    const planarized = vn.VectorNetworkEditor.planarize(network);

    // Should have more vertices and segments due to both types of intersections
    expect(planarized.vertices.length).toBeGreaterThan(network.vertices.length);
    expect(planarized.segments.length).toBeGreaterThan(network.segments.length);

    // Should have at least 4 vertices (original 4 + intersection points)
    expect(planarized.vertices.length).toBeGreaterThanOrEqual(4);

    // Should have at least 4 segments (original 2 + splits at intersections)
    expect(planarized.segments.length).toBeGreaterThanOrEqual(4);
  });

  test("should handle curves without self-intersections", () => {
    // Create a curve that doesn't self-intersect
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0: start point
        [100, 0], // 1: end point
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [0, 0], // straight line - no self-intersection
          tb: [0, 0],
        },
      ],
    };

    const planarized = vn.VectorNetworkEditor.planarize(network);

    // Should remain unchanged (no self-intersection)
    expect(planarized.vertices.length).toBe(network.vertices.length);
    expect(planarized.segments.length).toBe(network.segments.length);
  });
});

describe("vn.VectorNetworkEditor instance planarize", () => {
  test("should modify network in-place", () => {
    // Create a network with two crossing diagonal segments
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0: top-left
        [100, 100], // 1: bottom-right
        [0, 100], // 2: bottom-left
        [100, 0], // 3: top-right
      ],
      segments: [
        {
          a: 0, // from top-left
          b: 1, // to bottom-right
          ta: [0, 0],
          tb: [0, 0],
        },
        {
          a: 2, // from bottom-left
          b: 3, // to top-right
          ta: [0, 0],
          tb: [0, 0],
        },
      ],
    };

    const editor = new vn.VectorNetworkEditor(network);

    // Store original counts
    const originalVertexCount = editor.vertices.length;
    const originalSegmentCount = editor.segments.length;

    // Planarize in-place
    const result = editor.planarize();

    // Should have more vertices and segments
    expect(editor.vertices.length).toBeGreaterThan(originalVertexCount);
    expect(editor.segments.length).toBeGreaterThan(originalSegmentCount);

    // Should have exactly 5 vertices (original 4 + 1 intersection)
    expect(editor.vertices.length).toBe(5);

    // Should have exactly 4 segments (each original segment split into 2)
    expect(editor.segments.length).toBe(4);

    // Result should be the same as the modified instance
    expect(result.vertices).toBe(editor.vertices);
    expect(result.segments).toBe(editor.segments);

    // Check that the intersection point is at (50, 50)
    const intersectionVertex = editor.vertices.find(
      (v) => Math.abs(v[0] - 50) < 1e-3 && Math.abs(v[1] - 50) < 1e-3
    );
    expect(intersectionVertex).toBeDefined();
  });

  test("should handle networks with no intersections in-place", () => {
    // Create a network with parallel segments
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0
        [100, 0], // 1
        [0, 50], // 2
        [100, 50], // 3
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [0, 0],
          tb: [0, 0],
        },
        {
          a: 2,
          b: 3,
          ta: [0, 0],
          tb: [0, 0],
        },
      ],
    };

    const editor = new vn.VectorNetworkEditor(network);

    // Store original counts
    const originalVertexCount = editor.vertices.length;
    const originalSegmentCount = editor.segments.length;

    // Planarize in-place
    const result = editor.planarize();

    // Should remain unchanged
    expect(editor.vertices.length).toBe(originalVertexCount);
    expect(editor.segments.length).toBe(originalSegmentCount);

    // Result should be the same as the modified instance
    expect(result.vertices).toBe(editor.vertices);
    expect(result.segments).toBe(editor.segments);
  });

  test("should return the modified network", () => {
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0],
        [100, 100],
        [0, 100],
        [100, 0],
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [0, 0],
          tb: [0, 0],
        },
        {
          a: 2,
          b: 3,
          ta: [0, 0],
          tb: [0, 0],
        },
      ],
    };

    const editor = new vn.VectorNetworkEditor(network);

    // Store original counts
    const originalVertexCount = editor.vertices.length;
    const originalSegmentCount = editor.segments.length;

    // Planarize in-place
    const result = editor.planarize();

    // Should have more vertices and segments
    expect(editor.vertices.length).toBeGreaterThan(originalVertexCount);
    expect(editor.segments.length).toBeGreaterThan(originalSegmentCount);

    // Result should match the modified instance
    expect(result.vertices).toBe(editor.vertices);
    expect(result.segments).toBe(editor.segments);

    // Should have exactly 5 vertices (original 4 + 1 intersection)
    expect(editor.vertices.length).toBe(5);

    // Should have exactly 4 segments (each original segment split into 2)
    expect(editor.segments.length).toBe(4);
  });

  test("should handle self-intersecting segments in-place", () => {
    // Create a curve that actually self-intersects
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0: start point
        [100, 0], // 1: end point
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [200, 200], // control point 1 (creates upward loop)
          tb: [-100, 200], // control point 2 (creates downward loop)
        },
      ],
    };

    const editor = new vn.VectorNetworkEditor(network);

    // Store original counts
    const originalVertexCount = editor.vertices.length;
    const originalSegmentCount = editor.segments.length;

    // Planarize in-place
    const result = editor.planarize();

    // Should have more vertices and segments due to self-intersection
    expect(editor.vertices.length).toBeGreaterThan(originalVertexCount);
    expect(editor.segments.length).toBeGreaterThan(originalSegmentCount);

    // Should have exactly 3 vertices (original 2 + 1 intersection point)
    expect(editor.vertices.length).toBe(3);

    // Should have exactly 3 segments (original segment split into 3 parts)
    expect(editor.segments.length).toBe(3);

    // Result should be the same as the modified instance
    expect(result.vertices).toBe(editor.vertices);
    expect(result.segments).toBe(editor.segments);

    // Check that the intersection point is at the expected location
    const intersectionVertex = editor.vertices.find(
      (v) => Math.abs(v[0] - 71.4) < 1 && Math.abs(v[1] - 85.7) < 1
    );
    expect(intersectionVertex).toBeDefined();
  });

  test("should handle both self and cross intersections in-place", () => {
    // Create a network with both self-intersecting and cross-intersecting segments
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0: start of self-intersecting curve
        [100, 0], // 1: end of self-intersecting curve
        [50, 50], // 2: start of crossing line
        [50, -50], // 3: end of crossing line
      ],
      segments: [
        {
          a: 0,
          b: 1, // self-intersecting curve
          ta: [200, 200],
          tb: [-100, 200],
        },
        {
          a: 2,
          b: 3, // straight line that crosses the self-intersecting curve
          ta: [0, 0],
          tb: [0, 0],
        },
      ],
    };

    const editor = new vn.VectorNetworkEditor(network);

    // Store original counts
    const originalVertexCount = editor.vertices.length;
    const originalSegmentCount = editor.segments.length;

    // Planarize in-place
    const result = editor.planarize();

    // Should have more vertices and segments due to both types of intersections
    expect(editor.vertices.length).toBeGreaterThan(originalVertexCount);
    expect(editor.segments.length).toBeGreaterThan(originalSegmentCount);

    // Should have at least 4 vertices (original 4 + intersection points)
    expect(editor.vertices.length).toBeGreaterThanOrEqual(4);

    // Should have at least 4 segments (original 2 + splits at intersections)
    expect(editor.segments.length).toBeGreaterThanOrEqual(4);

    // Result should be the same as the modified instance
    expect(result.vertices).toBe(editor.vertices);
    expect(result.segments).toBe(editor.segments);
  });

  test("should handle segments without self-intersections in-place", () => {
    // Create a simple curve that doesn't self-intersect
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0: start point
        [100, 0], // 1: end point
      ],
      segments: [
        {
          a: 0,
          b: 1,
          ta: [50, 25], // control point that doesn't create self-intersection
          tb: [-50, 25],
        },
      ],
    };

    const editor = new vn.VectorNetworkEditor(network);

    // Store original counts
    const originalVertexCount = editor.vertices.length;
    const originalSegmentCount = editor.segments.length;

    // Planarize in-place
    const result = editor.planarize();

    // Should remain unchanged (no self-intersection)
    expect(editor.vertices.length).toBe(originalVertexCount);
    expect(editor.segments.length).toBe(originalSegmentCount);

    // Result should be the same as the modified instance
    expect(result.vertices).toBe(editor.vertices);
    expect(result.segments).toBe(editor.segments);
  });
});
