import { snapObjectsResize } from "../snap-resize";
import cmath from "@grida/cmath";

describe("snapObjectsResize integration", () => {
  it("calculates resized bounding rect correctly for visual guides", () => {
    const agents = [{ x: 0, y: 0, width: 100, height: 100 }];
    const anchors = {
      objects: [{ x: 150, y: 0, width: 50, height: 50 }],
    };

    const result = snapObjectsResize(
      agents,
      anchors,
      "e", // East handle (right edge)
      [0, 0], // Origin at top-left
      [47, 0], // Movement that should snap to 150
      5, // Threshold
      { enabled: true }
    );

    expect(result.adjusted_movement[0]).toBeCloseTo(50); // Snapped movement
    expect(result.snapping).toBeDefined();

    if (result.snapping && result.snapping.by_objects) {
      const translated = result.snapping.by_objects.translated;
      // The resized rect should have right edge at x=150 (snapped position)
      expect(translated.x + translated.width).toBeCloseTo(150);
      // Not at the initial position (100)
      expect(translated.x + translated.width).not.toBeCloseTo(100);
    }
  });

  it("handles center-origin resize correctly", () => {
    const agents = [{ x: 50, y: 50, width: 100, height: 100 }];
    const anchors = {
      objects: [{ x: 200, y: 0, width: 50, height: 50 }],
    };

    const result = snapObjectsResize(
      agents,
      anchors,
      "e",
      [100, 100], // Center origin
      [47, 0],
      5,
      { enabled: true, centerOrigin: true }
    );

    expect(result.snapping).toBeDefined();

    if (result.snapping && result.snapping.by_objects) {
      const translated = result.snapping.by_objects.translated;
      // Center should remain roughly at original position
      const center_x = translated.x + translated.width / 2;
      expect(center_x).toBeCloseTo(100, 1);
    }
  });

  it("handles aspect ratio preservation", () => {
    const agents = [{ x: 0, y: 0, width: 100, height: 100 }];
    const anchors = {
      objects: [{ x: 150, y: 150, width: 50, height: 50 }],
    };

    const result = snapObjectsResize(
      agents,
      anchors,
      "se", // Southeast corner
      [0, 0],
      [47, 30], // Asymmetric movement
      5,
      { enabled: true, preserveAspectRatio: true }
    );

    expect(result.snapping).toBeDefined();

    if (result.snapping && result.snapping.by_objects) {
      const translated = result.snapping.by_objects.translated;
      // With aspect ratio, width and height should be equal (1:1 ratio)
      expect(translated.width).toBeCloseTo(translated.height, 1);
    }
  });

  it("returns undefined snapping when snap is disabled", () => {
    const agents = [{ x: 0, y: 0, width: 100, height: 100 }];
    const anchors = {
      objects: [{ x: 150, y: 0, width: 50, height: 50 }],
    };

    const result = snapObjectsResize(agents, anchors, "e", [0, 0], [47, 0], 5, {
      enabled: false,
    });

    expect(result.snapping).toBeUndefined();
    expect(result.adjusted_movement).toEqual([47, 0]); // No adjustment
  });

  it("populates hit points for visual feedback", () => {
    const agents = [{ x: 0, y: 0, width: 100, height: 100 }];
    const anchors = {
      objects: [{ x: 150, y: 0, width: 50, height: 50 }],
    };

    const result = snapObjectsResize(agents, anchors, "e", [0, 0], [47, 0], 5, {
      enabled: true,
    });

    expect(result.snapping).toBeDefined();

    if (result.snapping && result.snapping.by_objects) {
      // Should have hit points for the agent (resized object)
      expect(result.snapping.by_objects.hit_points.agent.length).toBe(9); // 9-point geometry
      // Should have hit points for anchors
      expect(result.snapping.by_objects.hit_points.anchors.length).toBe(1); // One anchor object
      expect(result.snapping.by_objects.hit_points.anchors[0].length).toBe(9); // 9 points per anchor
    }
  });

  it("handles snapping to guides", () => {
    const agents = [{ x: 0, y: 0, width: 100, height: 100 }];
    const anchors = {
      guides: [{ axis: "x" as const, offset: 150 }],
    };

    const result = snapObjectsResize(agents, anchors, "e", [0, 0], [47, 0], 5, {
      enabled: true,
    });

    expect(result.snapping).toBeDefined();
    expect(result.adjusted_movement[0]).toBeCloseTo(50);

    if (result.snapping && result.snapping.by_guides) {
      expect(result.snapping.by_guides.x).toBeDefined();
      expect(result.snapping.by_guides.x?.aligned_anchors_idx).toContain(0); // Guide at index 0
    }
  });

  it("only highlights moving points, not aligned static points", () => {
    // Two rectangles with aligned top edges at y=0
    const agents = [{ x: 100, y: 0, width: 100, height: 100 }]; // Rect being resized
    const anchors = {
      objects: [{ x: 50, y: 0, width: 50, height: 100 }], // Reference rect at left
    };

    // Resize using E (east/right) handle - only right edge moves
    // The top edges are already aligned, but that shouldn't highlight the top edge
    const result = snapObjectsResize(
      agents,
      anchors,
      "e", // East handle (right edge)
      [100, 0], // Origin at left edge
      [47, 0], // Moving right, should snap to anchor's right edge at x=100
      5,
      { enabled: true }
    );

    if (result.snapping && result.snapping.by_objects) {
      const hit_points = result.snapping.by_objects.hit_points.agent;

      // 9-point indices:
      // 0: top-left, 1: top-center, 2: top-right
      // 3: mid-left, 4: center, 5: mid-right
      // 6: bottom-left, 7: bottom-center, 8: bottom-right

      // For E handle, ONLY moving points are: 2, 5, 8 (right edge)
      // Non-moving points are: 0, 1, 3, 4, 6, 7 (left and center parts)

      // Even though top edges are aligned at y=0, top-left (0) should NOT be highlighted
      expect(hit_points[0]).toEqual([false, false]);

      // Top-center (index 1) should NOT be highlighted
      expect(hit_points[1]).toEqual([false, false]);

      // Mid-left (index 3) should NOT be highlighted
      expect(hit_points[3]).toEqual([false, false]);

      // Bottom-left (index 6) should NOT be highlighted
      expect(hit_points[6]).toEqual([false, false]);

      // Bottom-center (index 7) should NOT be highlighted
      expect(hit_points[7]).toEqual([false, false]);
    }
  });
});
