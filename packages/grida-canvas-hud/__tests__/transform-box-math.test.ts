import { describe, it, expect } from "vitest";
import cmath from "@grida/cmath";
import {
  type AffineTransform,
  reduceTransformBox,
  getTransformBoxCorners,
  decompose as decomposeTransformBox,
} from "../primitives/transform-box";

// Original Direction Scaling Challenge
//
// NOTE: True original-direction scaling (scaling X/Y axes regardless of rotation)
// is a complex mathematical problem. The requirement is:
//
// "When dragging a side of a rotated shape, scale in the ORIGINAL direction
// (as if the rotation was not applied), not along the rotated axes."
//
// This requires advanced matrix manipulation that goes beyond simple
// decompose/compose operations.
// Coverage target: scale side drags in original (unrotated) axis for
// rotated transforms once the exact matrix semantics are specified.

describe("Transform Box Editor", () => {
  const size: cmath.Vector2 = [200, 100];
  const identity: AffineTransform = [
    [1, 0, 0],
    [0, 1, 0],
  ];

  describe("Basic functionality", () => {
    it("should handle identity transform correctly", () => {
      const corners = getTransformBoxCorners(identity, size);

      expect(corners.nw).toEqual([0, 0]);
      expect(corners.ne).toEqual([200, 0]);
      expect(corners.se).toEqual([200, 100]);
      expect(corners.sw).toEqual([0, 100]);
    });

    it("should handle centered scaling correctly", () => {
      const centeredScale: AffineTransform = [
        [0.5, 0, 0.25],
        [0, 0.5, 0.25],
      ];

      const corners = getTransformBoxCorners(centeredScale, size);

      expect(corners.nw[0]).toBeCloseTo(50, 1);
      expect(corners.nw[1]).toBeCloseTo(25, 1);
      expect(corners.ne[0]).toBeCloseTo(150, 1);
      expect(corners.ne[1]).toBeCloseTo(25, 1);
      expect(corners.se[0]).toBeCloseTo(150, 1);
      expect(corners.se[1]).toBeCloseTo(75, 1);
      expect(corners.sw[0]).toBeCloseTo(50, 1);
      expect(corners.sw[1]).toBeCloseTo(75, 1);
    });

    it("should handle translation correctly", () => {
      const pixelDelta: cmath.Vector2 = [40, 20];

      const translated = reduceTransformBox(
        identity,
        { type: "translate", delta: pixelDelta },
        { size }
      );

      expect(translated[0][2]).toBeCloseTo(0.2, 3); // 40/200
      expect(translated[1][2]).toBeCloseTo(0.2, 3); // 20/100
      expect(translated[0][0]).toBeCloseTo(1, 3);
      expect(translated[1][1]).toBeCloseTo(1, 3);
    });
  });

  describe("Rotation behavior", () => {
    it("should preserve center during rotation", () => {
      const baseTransform: AffineTransform = [
        [1.5, 0, 0.1],
        [0, 0.8, 0.2],
      ];

      const initialCorners = getTransformBoxCorners(baseTransform, size);
      const initialCenter = cmath.vector2.multiply(
        cmath.vector2.add(initialCorners.nw, initialCorners.se),
        [0.5, 0.5]
      );

      const rotationAngle = Math.PI / 6; // 30 degrees
      const rotatePoint = (point: cmath.Vector2): cmath.Vector2 => {
        const relative = cmath.vector2.sub(point, initialCenter);
        const cos = Math.cos(rotationAngle),
          sin = Math.sin(rotationAngle);
        return cmath.vector2.add(initialCenter, [
          relative[0] * cos - relative[1] * sin,
          relative[0] * sin + relative[1] * cos,
        ]);
      };

      const expectedNE = rotatePoint(initialCorners.ne);
      const rotationDelta = cmath.vector2.sub(expectedNE, initialCorners.ne);

      const rotatedTransform = reduceTransformBox(
        baseTransform,
        { type: "rotate", corner: "ne", delta: rotationDelta },
        { size }
      );

      const finalCorners = getTransformBoxCorners(rotatedTransform, size);
      const finalCenter = cmath.vector2.multiply(
        cmath.vector2.add(finalCorners.nw, finalCorners.se),
        [0.5, 0.5]
      );

      expect(finalCenter[0]).toBeCloseTo(initialCenter[0], 1);
      expect(finalCenter[1]).toBeCloseTo(initialCenter[1], 1);

      expect(rotatedTransform).not.toEqual(baseTransform);
    });

    it("should preserve distances during rotation", () => {
      const baseTransform: AffineTransform = [
        [1.2, 0, 0.1],
        [0, 0.8, 0.15],
      ];

      const initialCorners = getTransformBoxCorners(baseTransform, size);
      const initialCenter = cmath.vector2.multiply(
        cmath.vector2.add(initialCorners.nw, initialCorners.se),
        [0.5, 0.5]
      );

      const initialWidth = cmath.vector2.distance(
        initialCorners.ne,
        initialCorners.nw
      );
      const initialHeight = cmath.vector2.distance(
        initialCorners.nw,
        initialCorners.sw
      );

      const rotationAngle = Math.PI / 4; // 45 degrees
      const rotatePoint = (point: cmath.Vector2): cmath.Vector2 => {
        const relative = cmath.vector2.sub(point, initialCenter);
        const cos = Math.cos(rotationAngle),
          sin = Math.sin(rotationAngle);
        return cmath.vector2.add(initialCenter, [
          relative[0] * cos - relative[1] * sin,
          relative[0] * sin + relative[1] * cos,
        ]);
      };

      const expectedNE = rotatePoint(initialCorners.ne);
      const rotationDelta = cmath.vector2.sub(expectedNE, initialCorners.ne);

      const rotatedTransform = reduceTransformBox(
        baseTransform,
        { type: "rotate", corner: "ne", delta: rotationDelta },
        { size }
      );

      const finalCorners = getTransformBoxCorners(rotatedTransform, size);
      const finalWidth = cmath.vector2.distance(
        finalCorners.ne,
        finalCorners.nw
      );
      const finalHeight = cmath.vector2.distance(
        finalCorners.nw,
        finalCorners.sw
      );

      expect(finalWidth).toBeCloseTo(initialWidth, 1);
      expect(finalHeight).toBeCloseTo(initialHeight, 1);
    });
  });

  describe("Side scaling behavior", () => {
    it("should handle side scaling with current approach", () => {
      const testDelta: cmath.Vector2 = [20, 10];

      const result = reduceTransformBox(
        identity,
        { type: "scale-side", side: "right", delta: testDelta },
        { size }
      );

      expect(result).toBeDefined();
      expect(result).not.toEqual(identity); // Should change

      const corners = getTransformBoxCorners(result, size);
      expect(corners.nw).toBeDefined();
      expect(corners.ne).toBeDefined();
      expect(corners.se).toBeDefined();
      expect(corners.sw).toBeDefined();
    });

    // NOTE: True original-direction scaling (scaling X/Y axes regardless of rotation)
    // is a complex mathematical problem that requires advanced matrix manipulation.
    // The current implementation provides reasonable scaling behavior for most use cases.
  });

  describe("Corner scaling behavior (gridaco/grida#881)", () => {
    it("scales from the dragged corner, anchoring the opposite corner", () => {
      // Drag SE by (40, 20) on a 200×100 identity box → width 240, height 120,
      // NW (the opposite corner) fixed at the origin.
      const result = reduceTransformBox(
        identity,
        { type: "scale-corner", corner: "se", delta: [40, 20] },
        { size }
      );
      const corners = getTransformBoxCorners(result, size);
      expect(corners.nw[0]).toBeCloseTo(0, 6);
      expect(corners.nw[1]).toBeCloseTo(0, 6);
      expect(corners.se[0]).toBeCloseTo(240, 6);
      expect(corners.se[1]).toBeCloseTo(120, 6);
      expect(corners.ne[0]).toBeCloseTo(240, 6);
      expect(corners.ne[1]).toBeCloseTo(0, 6);
      expect(corners.sw[0]).toBeCloseTo(0, 6);
      expect(corners.sw[1]).toBeCloseTo(120, 6);
    });

    it("anchors the NW corner when dragging SE (opposite corner stays put)", () => {
      const result = reduceTransformBox(
        identity,
        { type: "scale-corner", corner: "nw", delta: [10, 30] },
        { size }
      );
      const corners = getTransformBoxCorners(result, size);
      // Dragging NW anchors SE at (200, 100).
      expect(corners.se[0]).toBeCloseTo(200, 6);
      expect(corners.se[1]).toBeCloseTo(100, 6);
      // NW moved by the drag delta.
      expect(corners.nw[0]).toBeCloseTo(10, 6);
      expect(corners.nw[1]).toBeCloseTo(30, 6);
    });

    it("keeps the box a rectangle (no shear) under an axis-aligned corner drag", () => {
      const result = reduceTransformBox(
        identity,
        { type: "scale-corner", corner: "ne", delta: [25, -15] },
        { size }
      );
      const corners = getTransformBoxCorners(result, size);
      // Top edge stays horizontal, right edge stays vertical.
      expect(corners.nw[1]).toBeCloseTo(corners.ne[1], 6);
      expect(corners.ne[0]).toBeCloseTo(corners.se[0], 6);
    });

    it("returns base unchanged when the basis is fully collapsed (no NaN)", () => {
      const collapsed: AffineTransform = [
        [0, 0, 0],
        [0, 0, 0],
      ];
      const result = reduceTransformBox(
        collapsed,
        { type: "scale-corner", corner: "se", delta: [10, 10] },
        { size }
      );
      expect(result).toEqual(collapsed);
    });
  });

  describe("Modifiers — Alt / Shift, identical to the element box (gridaco/grida#881)", () => {
    it("Alt scales a corner from the box center (center fixed, symmetric)", () => {
      const result = reduceTransformBox(
        identity,
        { type: "scale-corner", corner: "se", delta: [40, 20] },
        { size, modifiers: { alt: true } }
      );
      const c = getTransformBoxCorners(result, size);
      // center stays at (100, 50); SE and NW move out symmetrically.
      const cx = (c.nw[0] + c.se[0]) / 2;
      const cy = (c.nw[1] + c.se[1]) / 2;
      expect(cx).toBeCloseTo(100, 6);
      expect(cy).toBeCloseTo(50, 6);
      expect(c.se[0]).toBeCloseTo(240, 6);
      expect(c.nw[0]).toBeCloseTo(-40, 6);
    });

    it("Shift aspect-locks a corner scale (uniform = larger magnitude)", () => {
      // delta (40, 10) → raw sx=1.2, sy=1.1; Shift locks both to 1.2.
      const result = reduceTransformBox(
        identity,
        { type: "scale-corner", corner: "se", delta: [40, 10] },
        { size, modifiers: { shift: true } }
      );
      const c = getTransformBoxCorners(result, size);
      expect(c.se[0]).toBeCloseTo(240, 6); // 200 * 1.2
      expect(c.se[1]).toBeCloseTo(120, 6); // 100 * 1.2 (not 110)
    });

    it("Shift aspect-locks a side scale (drives the perpendicular axis, centered)", () => {
      // right drag widens to 1.2×; Shift grows height 1.2× about the center.
      const result = reduceTransformBox(
        identity,
        { type: "scale-side", side: "right", delta: [40, 0] },
        { size, modifiers: { shift: true } }
      );
      const c = getTransformBoxCorners(result, size);
      expect(c.ne[0]).toBeCloseTo(240, 6); // width 240
      expect(c.nw[1]).toBeCloseTo(-10, 6); // height grew about y=50
      expect(c.sw[1]).toBeCloseTo(110, 6); // → 120 tall, centered
    });

    it("Alt scales a side from the center (opposite edge moves too)", () => {
      const result = reduceTransformBox(
        identity,
        { type: "scale-side", side: "right", delta: [40, 0] },
        { size, modifiers: { alt: true } }
      );
      const c = getTransformBoxCorners(result, size);
      expect(c.ne[0]).toBeCloseTo(240, 6); // right edge out
      expect(c.nw[0]).toBeCloseTo(-40, 6); // left edge out (center fixed)
    });

    it("Shift snaps a rotation to the 15° grid (absolute), changing the free angle", () => {
      const action = {
        type: "rotate" as const,
        corner: "ne" as const,
        delta: [-40, -40] as cmath.Vector2,
      };
      const snapped = reduceTransformBox(identity, action, {
        size,
        modifiers: { shift: true },
      });
      const free = reduceTransformBox(identity, action, { size });
      const rs = decomposeTransformBox(snapped).rotation;
      const rf = decomposeTransformBox(free).rotation;
      expect(Math.abs(rs - Math.round(rs / 15) * 15)).toBeLessThan(1e-6);
      expect(Math.abs(rs - rf)).toBeGreaterThan(0.1); // snap moved it off the free angle
    });

    it("Shift axis-locks a body translate to the dominant axis", () => {
      const dx_dominant = reduceTransformBox(
        identity,
        { type: "translate", delta: [40, 10] },
        { size, modifiers: { shift: true } }
      );
      expect(dx_dominant[0][2]).toBeCloseTo(0.2, 6); // 40/200
      expect(dx_dominant[1][2]).toBeCloseTo(0, 6); // y zeroed

      const dy_dominant = reduceTransformBox(
        identity,
        { type: "translate", delta: [10, 40] },
        { size, modifiers: { shift: true } }
      );
      expect(dy_dominant[0][2]).toBeCloseTo(0, 6); // x zeroed
      expect(dy_dominant[1][2]).toBeCloseTo(0.4, 6); // 40/100
    });
  });

  describe("Edge cases", () => {
    it("should handle zero deltas gracefully", () => {
      const result = reduceTransformBox(
        identity,
        { type: "translate", delta: [0, 0] },
        { size }
      );

      expect(result).toEqual(identity);
    });

    it("should handle very small rotations", () => {
      const result = reduceTransformBox(
        identity,
        { type: "rotate", corner: "ne", delta: [0.001, 0.001] },
        { size }
      );

      expect(result).toBeDefined();
    });
  });
});
