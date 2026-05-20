// `point_distance_to_shape` dispatch — one variant per HitShape kind.
// World-space; tolerance comparisons happen one layer up in the picker.

import { describe, expect, it } from "vitest";
import {
  point_distance_to_shape,
  type HitShape,
} from "../../src/core/hit-shape";

describe("point_distance_to_shape", () => {
  describe("rect", () => {
    const r: HitShape = { kind: "rect", x: 0, y: 0, width: 10, height: 10 };

    it("interior point returns 0 (treated as a fill hit)", () => {
      expect(point_distance_to_shape({ x: 5, y: 5 }, r)).toBe(0);
    });

    it("point on the edge returns 0", () => {
      expect(point_distance_to_shape({ x: 0, y: 5 }, r)).toBe(0);
    });

    it("outside on the right reports horizontal distance", () => {
      expect(point_distance_to_shape({ x: 13, y: 5 }, r)).toBeCloseTo(3);
    });

    it("outside on a corner reports euclidean distance", () => {
      expect(point_distance_to_shape({ x: 13, y: -4 }, r)).toBeCloseTo(5);
    });
  });

  describe("ellipse", () => {
    const e: HitShape = { kind: "ellipse", cx: 10, cy: 10, rx: 5, ry: 5 };

    it("center returns 0 (interior)", () => {
      expect(point_distance_to_shape({ x: 10, y: 10 }, e)).toBe(0);
    });

    it("point on circle boundary returns ~0", () => {
      expect(point_distance_to_shape({ x: 15, y: 10 }, e)).toBeCloseTo(0);
    });

    it("outside reports radial distance", () => {
      expect(point_distance_to_shape({ x: 18, y: 10 }, e)).toBeCloseTo(3);
    });

    it("degenerate (zero radii) falls back to center distance", () => {
      const d: HitShape = { kind: "ellipse", cx: 0, cy: 0, rx: 0, ry: 0 };
      expect(point_distance_to_shape({ x: 3, y: 4 }, d)).toBeCloseTo(5);
    });
  });

  describe("segment", () => {
    const s: HitShape = {
      kind: "segment",
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
    };

    it("point on the segment returns 0", () => {
      expect(point_distance_to_shape({ x: 5, y: 0 }, s)).toBe(0);
    });

    it("perpendicular foot inside returns perpendicular distance", () => {
      expect(point_distance_to_shape({ x: 5, y: 4 }, s)).toBeCloseTo(4);
    });

    it("clamps to endpoint when foot lies past b", () => {
      expect(point_distance_to_shape({ x: 13, y: 0 }, s)).toBeCloseTo(3);
    });
  });

  describe("polyline (open)", () => {
    const p: HitShape = {
      kind: "polyline",
      closed: false,
      pts: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    };

    it("near first edge returns distance to that edge", () => {
      expect(point_distance_to_shape({ x: 5, y: 3 }, p)).toBeCloseTo(3);
    });

    it("near second edge returns distance to that edge", () => {
      expect(point_distance_to_shape({ x: 8, y: 5 }, p)).toBeCloseTo(2);
    });

    it("interior gap is NOT treated as a hit (open chain has no interior)", () => {
      // Point (3, 3) is near the L's bend but inside the "L" region —
      // there's no closing edge. Distance is to the nearest segment.
      const d = point_distance_to_shape({ x: 3, y: 3 }, p);
      // Distance from (3,3) to segment (0,0)-(10,0) is 3.
      expect(d).toBeCloseTo(3);
    });
  });

  describe("polygon (closed)", () => {
    const p: HitShape = {
      kind: "polygon",
      closed: true,
      pts: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };

    it("interior point returns 0 (filled region)", () => {
      expect(point_distance_to_shape({ x: 5, y: 5 }, p)).toBe(0);
    });

    it("outside returns distance to nearest edge", () => {
      expect(point_distance_to_shape({ x: 13, y: 5 }, p)).toBeCloseTo(3);
    });
  });

  describe("path (control-polyline approx)", () => {
    it("open path uses polyline distance", () => {
      const shape: HitShape = {
        kind: "path",
        closed: false,
        pts: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      };
      expect(point_distance_to_shape({ x: 5, y: 4 }, shape)).toBeCloseTo(4);
    });

    it("closed path includes the closing edge (open form ignores it)", () => {
      // Triangle vertices: (0,0), (10,0), (5,10). For point (3, 5), the
      // closing edge (5,10)→(0,0) passes very close (foot at (2.6, 5.2),
      // distance ≈ 0.45). The open form ignores that edge and falls back
      // to the right edge (~4.02). The closed form should be far smaller.
      const open: HitShape = {
        kind: "path",
        closed: false,
        pts: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 10 },
        ],
      };
      const closed: HitShape = { ...open, closed: true };
      const d_open = point_distance_to_shape({ x: 3, y: 5 }, open);
      const d_closed = point_distance_to_shape({ x: 3, y: 5 }, closed);
      expect(d_open).toBeGreaterThan(3);
      expect(d_closed).toBeLessThan(1);
    });
  });
});
