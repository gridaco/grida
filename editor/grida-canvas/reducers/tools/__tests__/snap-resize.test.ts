import cmath from "@grida/cmath";
import {
  calculateResizeSnap,
  getResizeSnapPoints,
  adjustMovementForSnap,
} from "../snap-resize";

describe("getResizeSnapPoints", () => {
  it("returns right edge 3 points for east handle", () => {
    const rect: cmath.Rectangle = { x: 0, y: 0, width: 100, height: 100 };
    const points = getResizeSnapPoints(rect, "e", [0, 0], [50, 0], false);

    // After applying movement [50, 0], right edge moves from x=100 to x=150
    expect(points).toEqual([
      [150, 0], // top-right (after movement)
      [150, 50], // mid-right (after movement)
      [150, 100], // bottom-right (after movement)
    ]);
  });

  it("returns left edge 3 points for west handle", () => {
    const rect: cmath.Rectangle = { x: 100, y: 0, width: 100, height: 100 };
    const points = getResizeSnapPoints(rect, "w", [200, 0], [50, 0], false);

    // West handle moves left edge. Movement [50, 0] with direction vector [-1,0]
    // gives size_delta=[-50, 0], so width becomes 50, left edge moves to x=150
    expect(points).toEqual([
      [150, 0], // top-left (after movement)
      [150, 50], // mid-left (after movement)
      [150, 100], // bottom-left (after movement)
    ]);
  });

  it("returns top edge 3 points for north handle", () => {
    const rect: cmath.Rectangle = { x: 0, y: 100, width: 100, height: 100 };
    const points = getResizeSnapPoints(rect, "n", [0, 200], [0, 50], false);

    // North handle moves top edge. Movement [0, 50] with direction vector [0,-1]
    // gives size_delta=[0, -50], so height becomes 50, top edge moves to y=150
    expect(points).toEqual([
      [0, 150], // top-left (after movement)
      [50, 150], // top-mid (after movement)
      [100, 150], // top-right (after movement)
    ]);
  });

  it("returns bottom edge 3 points for south handle", () => {
    const rect: cmath.Rectangle = { x: 0, y: 0, width: 100, height: 100 };
    const points = getResizeSnapPoints(rect, "s", [0, 0], [0, 50], false);

    // After applying movement [0, 50], bottom edge moves from y=100 to y=150
    expect(points).toEqual([
      [0, 150], // bottom-left (after movement)
      [50, 150], // bottom-mid (after movement)
      [100, 150], // bottom-right (after movement)
    ]);
  });

  it("returns corner + edges for southeast corner handle", () => {
    const rect: cmath.Rectangle = { x: 0, y: 0, width: 100, height: 100 };
    const points = getResizeSnapPoints(rect, "se", [0, 0], [50, 50], false);

    expect(points.length).toBeGreaterThan(1);
    // After movement [50, 50], corner moves from [100, 100] to [150, 150]
    expect(points).toContainEqual([150, 150]); // corner (after movement)
    // Should also include right edge and bottom edge points
  });

  it("returns corner + edges for northeast corner handle", () => {
    const rect: cmath.Rectangle = { x: 0, y: 100, width: 100, height: 100 };
    const points = getResizeSnapPoints(rect, "ne", [0, 200], [50, -50], false);

    expect(points.length).toBeGreaterThan(1);
    // NE direction vector is [1, -1]. Movement [50, -50] gives size_delta=[50, 50]
    // Width becomes 150, height becomes 150. Top-right corner is at [150, 50]
    expect(points).toContainEqual([150, 50]); // corner (after movement)
  });

  it("returns all moving edges for center-origin mode with east handle", () => {
    const rect: cmath.Rectangle = { x: 0, y: 0, width: 100, height: 100 };
    const points = getResizeSnapPoints(rect, "e", [50, 50], [50, 0], true);

    // In center origin mode, both left and right edges move
    expect(points.length).toBeGreaterThanOrEqual(6); // 3 on each side
  });
});

describe("calculateResizeSnap", () => {
  it("snaps right edge to anchor point", () => {
    const result = calculateResizeSnap({
      initial: { x: 0, y: 0, width: 100, height: 100 },
      direction: "e",
      origin: [0, 0],
      movement: [47, 0], // Moving to x=147, anchor at x=150
      anchors: [[150, 50]],
      threshold: 5,
    });

    expect(result.adjustedMovement).toEqual([50, 0]); // Snapped to 150
    expect(result.snapDelta).toEqual([3, 0]);
  });

  it("does not snap when outside threshold", () => {
    const result = calculateResizeSnap({
      initial: { x: 0, y: 0, width: 100, height: 100 },
      direction: "e",
      origin: [0, 0],
      movement: [40, 0], // Moving to x=140, anchor at x=150
      anchors: [[150, 50]],
      threshold: 5,
    });

    expect(result.adjustedMovement).toEqual([40, 0]); // No snap
    expect(result.snapDelta).toEqual([0, 0]);
  });

  it("snaps left edge to anchor point", () => {
    const result = calculateResizeSnap({
      initial: { x: 100, y: 0, width: 100, height: 100 },
      direction: "w",
      origin: [200, 0],
      movement: [-47, 0], // Moving left edge from 100 to 53, anchor at 50
      anchors: [[50, 50]],
      threshold: 5,
    });

    expect(result.adjustedMovement).toEqual([-50, 0]); // Snapped to 50
    expect(result.snapDelta).toEqual([-3, 0]);
  });

  it("snaps top edge to anchor point", () => {
    const result = calculateResizeSnap({
      initial: { x: 0, y: 100, width: 100, height: 100 },
      direction: "n",
      origin: [0, 200],
      movement: [0, -47], // Moving top edge from 100 to 53, anchor at 50
      anchors: [[50, 50]],
      threshold: 5,
    });

    expect(result.adjustedMovement).toEqual([0, -50]); // Snapped to 50
    expect(result.snapDelta).toEqual([0, -3]);
  });

  it("snaps bottom edge to anchor point", () => {
    const result = calculateResizeSnap({
      initial: { x: 0, y: 0, width: 100, height: 100 },
      direction: "s",
      origin: [0, 0],
      movement: [0, 47], // Moving bottom edge from 100 to 147, anchor at 150
      anchors: [[50, 150]],
      threshold: 5,
    });

    expect(result.adjustedMovement).toEqual([0, 50]); // Snapped to 150
    expect(result.snapDelta).toEqual([0, 3]);
  });

  it("handles corner resize with aspect ratio preservation", () => {
    const result = calculateResizeSnap({
      initial: { x: 0, y: 0, width: 100, height: 100 },
      direction: "se",
      origin: [0, 0],
      movement: [47, 30], // Trying to resize diagonally
      anchors: [[150, 150]], // Anchor at corner
      threshold: 5,
      options: { preserveAspectRatio: true },
    });

    // With aspect ratio, if one axis snaps, the other should adjust to maintain ratio
    expect(result.adjustedMovement[0]).toBeCloseTo(result.adjustedMovement[1]);
  });

  it("handles center-origin resize", () => {
    const result = calculateResizeSnap({
      initial: { x: 50, y: 50, width: 100, height: 100 },
      direction: "e",
      origin: [100, 100], // Center of rectangle
      movement: [47, 0],
      anchors: [[200, 100]], // Anchor on right
      threshold: 5,
      options: { centerOrigin: true },
    });

    // In center origin mode, the movement affects both sides
    expect(result.snapDelta[0]).not.toBe(0);
  });

  it("snaps to closest anchor when multiple anchors are present", () => {
    const result = calculateResizeSnap({
      initial: { x: 0, y: 0, width: 100, height: 100 },
      direction: "e",
      origin: [0, 0],
      movement: [47, 0],
      anchors: [
        [145, 50], // Closer
        [150, 50], // Further
      ],
      threshold: 5,
    });

    // Should snap to 145 (closer)
    expect(result.adjustedMovement).toEqual([45, 0]);
  });

  it("returns original movement when no anchors", () => {
    const result = calculateResizeSnap({
      initial: { x: 0, y: 0, width: 100, height: 100 },
      direction: "e",
      origin: [0, 0],
      movement: [47, 0],
      anchors: [],
      threshold: 5,
    });

    expect(result.adjustedMovement).toEqual([47, 0]);
    expect(result.snapDelta).toEqual([0, 0]);
  });

  it("handles negative movement (resize in opposite direction)", () => {
    const result = calculateResizeSnap({
      initial: { x: 0, y: 0, width: 100, height: 100 },
      direction: "e",
      origin: [0, 0],
      movement: [-47, 0], // Shrinking
      anchors: [[50, 50]],
      threshold: 5,
    });

    expect(result.adjustedMovement).toEqual([-50, 0]); // Snapped to 50
  });
});

describe("adjustMovementForSnap", () => {
  it("adjusts movement to achieve snap on right edge", () => {
    const snapDelta: cmath.Vector2 = [5, 0]; // Need to move 5px more
    const adjusted = adjustMovementForSnap(
      snapDelta,
      "e",
      [0, 0],
      { x: 0, y: 0, width: 100, height: 100 },
      {}
    );

    expect(adjusted).toEqual([5, 0]);
  });

  it("adjusts movement to achieve snap on left edge", () => {
    const snapDelta: cmath.Vector2 = [-5, 0];
    const adjusted = adjustMovementForSnap(
      snapDelta,
      "w",
      [100, 0],
      { x: 0, y: 0, width: 100, height: 100 },
      {}
    );

    expect(adjusted).toEqual([-5, 0]);
  });

  it("adjusts movement to achieve snap on bottom edge", () => {
    const snapDelta: cmath.Vector2 = [0, 5];
    const adjusted = adjustMovementForSnap(
      snapDelta,
      "s",
      [0, 0],
      { x: 0, y: 0, width: 100, height: 100 },
      {}
    );

    expect(adjusted).toEqual([0, 5]);
  });

  it("maintains aspect ratio when enabled for corner resize", () => {
    const snapDelta: cmath.Vector2 = [3, 0]; // X snapped by 3
    const originalMovement: cmath.Vector2 = [47, 30]; // Original movement
    const adjusted = adjustMovementForSnap(
      snapDelta,
      "se",
      [0, 0],
      { x: 0, y: 0, width: 100, height: 100 },
      { preserveAspectRatio: true, originalMovement }
    );

    // New x = 47 + 3 = 50, so new y should also be 50 for 1:1 ratio
    // Y adjustment = 50 - 30 = 20
    expect(adjusted).toEqual([3, 20]);
  });

  it("maintains aspect ratio for non-square rectangle", () => {
    const snapDelta: cmath.Vector2 = [10, 0]; // X snapped by 10
    const originalMovement: cmath.Vector2 = [40, 15]; // Original movement
    const adjusted = adjustMovementForSnap(
      snapDelta,
      "se",
      [0, 0],
      { x: 0, y: 0, width: 100, height: 50 }, // 2:1 ratio
      { preserveAspectRatio: true, originalMovement }
    );

    // New x = 40 + 10 = 50, so new y should be 50/2 = 25 for 2:1 ratio
    // Y adjustment = 25 - 15 = 10
    expect(adjusted).toEqual([10, 10]);
  });

  it("returns zero adjustment when snap delta is zero", () => {
    const snapDelta: cmath.Vector2 = [0, 0];
    const adjusted = adjustMovementForSnap(
      snapDelta,
      "e",
      [0, 0],
      { x: 0, y: 0, width: 100, height: 100 },
      {}
    );

    expect(adjusted).toEqual([0, 0]);
  });
});
