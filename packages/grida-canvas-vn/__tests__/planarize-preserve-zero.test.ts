import { vn } from "../vn";

describe("vn.VectorNetworkEditor.planarize with preserveZero config", () => {
  it("should preserve zero tangents when preserveZero is true", () => {
    // Create a simple network with crossing straight lines (zero tangents)
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0
        [10, 10], // 1
        [0, 10], // 2
        [10, 0], // 3
      ],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] }, // diagonal from top-left to bottom-right
        { a: 2, b: 3, ta: [0, 0], tb: [0, 0] }, // diagonal from top-right to bottom-left
      ],
    };

    // Planarize with preserveZero = true (default)
    const planarized = vn.VectorNetworkEditor.planarize(network, {
      preserveZero: true,
    });

    // Should have more segments due to intersection
    expect(planarized.segments.length).toBeGreaterThan(network.segments.length);

    // All segments should still have zero tangents
    for (const segment of planarized.segments) {
      expect(segment.ta).toEqual([0, 0]);
      expect(segment.tb).toEqual([0, 0]);
    }
  });

  it("should not preserve zero tangents when preserveZero is false", () => {
    // Create a simple network with crossing straight lines (zero tangents)
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0
        [10, 10], // 1
        [0, 10], // 2
        [10, 0], // 3
      ],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] }, // diagonal from top-left to bottom-right
        { a: 2, b: 3, ta: [0, 0], tb: [0, 0] }, // diagonal from top-right to bottom-left
      ],
    };

    // Planarize with preserveZero = false
    const planarized = vn.VectorNetworkEditor.planarize(network, {
      preserveZero: false,
    });

    // Should have more segments due to intersection
    expect(planarized.segments.length).toBeGreaterThan(network.segments.length);

    // At least some segments should have non-zero tangents due to Bézier subdivision
    const hasNonZeroTangents = planarized.segments.some(
      (segment) =>
        !(
          segment.ta[0] === 0 &&
          segment.ta[1] === 0 &&
          segment.tb[0] === 0 &&
          segment.tb[1] === 0
        )
    );
    expect(hasNonZeroTangents).toBe(true);
  });

  it("should handle curved segments correctly with preserveZero", () => {
    // Create a network with curved segments (non-zero tangents)
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0
        [10, 10], // 1
        [0, 10], // 2
        [10, 0], // 3
      ],
      segments: [
        { a: 0, b: 1, ta: [5, 0], tb: [0, 5] }, // curved segment
        { a: 2, b: 3, ta: [0, -5], tb: [5, 0] }, // curved segment
      ],
    };

    // Planarize with preserveZero = true
    const planarized = vn.VectorNetworkEditor.planarize(network, {
      preserveZero: true,
    });

    // Should have more segments due to intersection
    expect(planarized.segments.length).toBeGreaterThan(network.segments.length);

    // Since original segments had non-zero tangents, preserveZero should not affect them
    // The subdivision should still use proper Bézier math
    const hasNonZeroTangents = planarized.segments.some(
      (segment) =>
        !(
          segment.ta[0] === 0 &&
          segment.ta[1] === 0 &&
          segment.tb[0] === 0 &&
          segment.tb[1] === 0
        )
    );
    expect(hasNonZeroTangents).toBe(true);
  });

  it("should work with instance method", () => {
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0], // 0
        [10, 10], // 1
        [0, 10], // 2
        [10, 0], // 3
      ],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 2, b: 3, ta: [0, 0], tb: [0, 0] },
      ],
    };

    const editor = new vn.VectorNetworkEditor(network);

    // Planarize in-place with preserveZero = true
    const result = editor.planarize({ preserveZero: true });

    // Should have more segments due to intersection
    expect(result.segments.length).toBeGreaterThan(network.segments.length);

    // All segments should still have zero tangents
    for (const segment of result.segments) {
      expect(segment.ta).toEqual([0, 0]);
      expect(segment.tb).toEqual([0, 0]);
    }
  });
});
