import cmath from "@grida/cmath";
import { calculateResizeSnap } from "../snap-resize";

// #region ResizeGestureSimulator - Test utility for simulating continuous resize gestures

interface Guide {
  axis: cmath.Axis;
  offset: number;
}

interface GestureState {
  movement: cmath.Vector2;
  resultRect: cmath.Rectangle;
  snapped: boolean;
  snapDelta: cmath.Vector2;
}

interface ResizeGestureSimulatorOptions {
  preserveAspectRatio?: boolean;
  centerOrigin?: boolean;
  threshold?: number;
}

/**
 * Simulates continuous resize gestures for testing snap behavior.
 *
 * This utility helps test how snap behaves during continuous user interaction,
 * catching issues that unit tests might miss (like flickering, hysteresis, etc.)
 */
class ResizeGestureSimulator {
  private initial: cmath.Rectangle;
  private direction: cmath.CardinalDirection;
  private origin: cmath.Vector2;
  private anchors: cmath.Vector2[];
  private threshold: number;
  private options: ResizeGestureSimulatorOptions;
  private currentMovement: cmath.Vector2 = [0, 0];
  private lastSnapState: GestureState | null = null;

  constructor(
    initial: cmath.Rectangle,
    direction: cmath.CardinalDirection,
    anchors: { points?: cmath.Vector2[]; guides?: Guide[] },
    options: ResizeGestureSimulatorOptions = {}
  ) {
    this.initial = initial;
    this.direction = direction;
    this.threshold = options.threshold ?? 5;
    this.options = options;

    this.origin = this.calculateOrigin(
      initial,
      direction,
      options.centerOrigin
    );

    this.anchors = [];
    if (anchors.points) {
      this.anchors.push(...anchors.points);
    }
    if (anchors.guides) {
      anchors.guides.forEach((guide) => {
        if (guide.axis === "x") {
          this.anchors.push([guide.offset, 0]);
          this.anchors.push([guide.offset, initial.height]);
        } else {
          this.anchors.push([0, guide.offset]);
          this.anchors.push([initial.width, guide.offset]);
        }
      });
    }
  }

  private calculateOrigin(
    rect: cmath.Rectangle,
    direction: cmath.CardinalDirection,
    centerOrigin: boolean = false
  ): cmath.Vector2 {
    if (centerOrigin) {
      return [rect.x + rect.width / 2, rect.y + rect.height / 2];
    }
    const opposite = cmath.compass.invertDirection(direction);
    return cmath.rect.getCardinalPoint(rect, opposite);
  }

  dragTo(handlePosition: cmath.Vector2): GestureState {
    const initialHandlePos = cmath.rect.getCardinalPoint(
      this.initial,
      this.direction
    );
    const movement = cmath.vector2.sub(handlePosition, initialHandlePos);
    return this.applyMovement(movement);
  }

  dragBy(delta: cmath.Vector2): GestureState {
    this.currentMovement = cmath.vector2.add(this.currentMovement, delta);
    return this.applyMovement(this.currentMovement);
  }

  private applyMovement(movement: cmath.Vector2): GestureState {
    const result = calculateResizeSnap({
      initial: this.initial,
      direction: this.direction,
      origin: this.origin,
      movement,
      anchors: this.anchors,
      threshold: this.threshold,
      options: {
        preserveAspectRatio: this.options.preserveAspectRatio,
        centerOrigin: this.options.centerOrigin,
      },
    });

    const snapped = result.snapDelta[0] !== 0 || result.snapDelta[1] !== 0;

    const direction_vector =
      cmath.compass.cardinal_direction_vector[this.direction];
    const multiplier = this.options.centerOrigin ? 2 : 1;
    const size_delta: cmath.Vector2 = [
      direction_vector[0] * result.adjustedMovement[0] * multiplier,
      direction_vector[1] * result.adjustedMovement[1] * multiplier,
    ];

    const scale = cmath.rect.getScaleFactors(this.initial, {
      x: this.initial.x,
      y: this.initial.y,
      width: this.initial.width + size_delta[0],
      height: this.initial.height + size_delta[1],
    });

    const resultRect = cmath.rect.positive(
      cmath.rect.scale(this.initial, this.origin, scale)
    );

    const state: GestureState = {
      movement: result.adjustedMovement,
      resultRect,
      snapped,
      snapDelta: result.snapDelta,
    };

    this.lastSnapState = state;
    return state;
  }

  getSnapState(): GestureState | null {
    return this.lastSnapState;
  }

  reset(): void {
    this.currentMovement = [0, 0];
    this.lastSnapState = null;
  }

  isSnapped(): boolean {
    return this.lastSnapState?.snapped ?? false;
  }

  getSnapDelta(): cmath.Vector2 {
    return this.lastSnapState?.snapDelta ?? [0, 0];
  }
}

// #endregion

describe("ResizeGestureSimulator", () => {
  it("tracks snap state through continuous drag", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 100, height: 100 },
      "e",
      { points: [[150, 50]] },
      { threshold: 5 }
    );

    // Drag towards snap point gradually
    const state1 = sim.dragTo([140, 0]); // Not yet in snap zone
    const state2 = sim.dragTo([145, 0]); // Entering snap zone
    const state3 = sim.dragTo([147, 0]); // In snap zone
    const state4 = sim.dragTo([155, 0]); // Still in snap zone
    const state5 = sim.dragTo([160, 0]); // Released from snap

    expect(state1.snapped).toBe(false);
    expect(state2.snapped).toBe(true); // Within threshold of 150
    expect(state3.snapped).toBe(true);
    expect(state4.snapped).toBe(true);
    expect(state5.snapped).toBe(false); // Too far from anchor

    // Verify the snapped states actually moved to the anchor
    expect(state2.resultRect.x + state2.resultRect.width).toBe(150);
    expect(state3.resultRect.x + state3.resultRect.width).toBe(150);
    expect(state4.resultRect.x + state4.resultRect.width).toBe(150);
  });

  it("handles snap to multiple anchors", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 100, height: 100 },
      "e",
      {
        points: [
          [150, 50], // First anchor
          [200, 50], // Second anchor further away
        ],
      },
      { threshold: 5 }
    );

    // Drag to first anchor
    const state1 = sim.dragTo([147, 0]);
    expect(state1.snapped).toBe(true);
    expect(state1.resultRect.x + state1.resultRect.width).toBe(150);

    // Move past first anchor towards second
    const state2 = sim.dragTo([175, 0]);
    expect(state2.snapped).toBe(false); // Between anchors

    // Reach second anchor
    const state3 = sim.dragTo([197, 0]);
    expect(state3.snapped).toBe(true);
    expect(state3.resultRect.x + state3.resultRect.width).toBe(200);
  });

  it("simulates corner resize with aspect ratio", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 100, height: 100 },
      "se",
      { points: [[150, 200]] }, // Anchor at corner
      { threshold: 5, preserveAspectRatio: true }
    );

    // Drag diagonally towards anchor
    const state1 = sim.dragTo([147, 120]); // X snaps to 150, Y follows

    expect(state1.snapped).toBe(true);
    // With aspect ratio, both dimensions should be equal
    expect(state1.resultRect.width).toBeCloseTo(state1.resultRect.height);
  });

  it("handles rapid movement through snap zone", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 100, height: 100 },
      "e",
      { points: [[150, 50]] },
      { threshold: 5 }
    );

    // Simulate rapid movement that jumps through the snap zone
    const states = [
      sim.dragTo([100, 0]), // Far before
      sim.dragTo([160, 0]), // Jump over snap zone
      sim.dragTo([147, 0]), // Back into snap zone
    ];

    expect(states[0].snapped).toBe(false);
    expect(states[1].snapped).toBe(false); // Jumped over
    expect(states[2].snapped).toBe(true); // Snapped when returning
  });

  it("handles resize past origin (negative scale)", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 100, height: 100 },
      "e",
      { points: [[-50, 50]] }, // Anchor on the left side
      { threshold: 5 }
    );

    // Drag left past the origin (negative width)
    const state = sim.dragTo([-47, 0]);

    // Should snap and handle negative width correctly
    expect(state.snapped).toBe(true);
    // Result rect should be normalized (positive width)
    expect(state.resultRect.width).toBeGreaterThan(0);
  });

  it("maintains snap when dragging along the snap line", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 100, height: 100 },
      "se",
      {
        points: [
          [150, 50],
          [150, 100],
          [150, 150],
        ],
      }, // Vertical line of anchors
      { threshold: 5 }
    );

    // Drag to snap on x-axis
    const state1 = sim.dragTo([147, 30]);
    expect(state1.snapped).toBe(true);
    expect(state1.resultRect.x + state1.resultRect.width).toBe(150);

    // Continue dragging vertically while maintaining x snap
    const state2 = sim.dragTo([147, 80]);
    expect(state2.snapped).toBe(true);
    expect(state2.resultRect.x + state2.resultRect.width).toBe(150);

    const state3 = sim.dragTo([147, 147]);
    expect(state3.snapped).toBe(true);
    expect(state3.resultRect.x + state3.resultRect.width).toBe(150);
  });

  it("handles center-origin resize symmetrically", () => {
    const sim = new ResizeGestureSimulator(
      { x: 50, y: 50, width: 100, height: 100 },
      "e",
      { points: [[200, 100]] }, // Anchor on right
      { threshold: 5, centerOrigin: true }
    );

    // With center origin, both sides move
    const state = sim.dragTo([197, 0]); // Near anchor

    expect(state.snapped).toBe(true);
    // Center should remain at original position
    const center_x = state.resultRect.x + state.resultRect.width / 2;
    expect(center_x).toBeCloseTo(100); // Original center was at 50 + 100/2 = 100
  });

  it("releases snap when moving outside threshold", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 100, height: 100 },
      "e",
      { points: [[150, 50]] },
      { threshold: 5 }
    );

    // Enter snap zone
    const state1 = sim.dragTo([147, 0]);
    expect(state1.snapped).toBe(true);

    // Move slightly but stay in zone
    const state2 = sim.dragTo([148, 0]);
    expect(state2.snapped).toBe(true);

    // Move outside threshold
    const state3 = sim.dragTo([156, 0]);
    expect(state3.snapped).toBe(false);
  });

  it("handles snapping on north handle (negative direction)", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 100, width: 100, height: 100 },
      "n",
      { points: [[50, 50]] }, // Anchor above
      { threshold: 5 }
    );

    // Drag upward (negative y movement for north handle)
    const state = sim.dragTo([0, 53]); // Near anchor at y=50

    expect(state.snapped).toBe(true);
    expect(state.resultRect.y).toBe(50);
  });

  it("handles sequential snaps to different anchors", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 100, height: 100 },
      "e",
      {
        points: [
          [120, 50],
          [150, 50],
          [180, 50],
        ],
      },
      { threshold: 5 }
    );

    // Snap to first anchor
    const state1 = sim.dragTo([118, 0]);
    expect(state1.snapped).toBe(true);
    expect(state1.resultRect.x + state1.resultRect.width).toBe(120);

    // Move to second anchor
    const state2 = sim.dragTo([147, 0]);
    expect(state2.snapped).toBe(true);
    expect(state2.resultRect.x + state2.resultRect.width).toBe(150);

    // Move to third anchor
    const state3 = sim.dragTo([178, 0]);
    expect(state3.snapped).toBe(true);
    expect(state3.resultRect.x + state3.resultRect.width).toBe(180);
  });
});

describe("Gesture edge cases", () => {
  it("handles zero-size rectangle without errors", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 0, height: 0 },
      "se",
      { points: [[100, 100]] },
      { threshold: 5 }
    );

    // Should not crash
    const state = sim.dragTo([98, 98]);
    expect(state).toBeDefined();
  });

  it("handles resize with no anchors", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 100, height: 100 },
      "e",
      { points: [] }, // No anchors
      { threshold: 5 }
    );

    const state = sim.dragTo([150, 0]);
    expect(state.snapped).toBe(false);
    expect(state.resultRect.x + state.resultRect.width).toBe(150);
  });

  it("handles very small threshold", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 100, height: 100 },
      "e",
      { points: [[150, 50]] },
      { threshold: 0.5 } // Very tight snap
    );

    const state1 = sim.dragTo([149, 0]); // Outside threshold
    expect(state1.snapped).toBe(false);

    const state2 = sim.dragTo([149.7, 0]); // Inside threshold
    expect(state2.snapped).toBe(true);
  });

  it("handles very large threshold", () => {
    const sim = new ResizeGestureSimulator(
      { x: 0, y: 0, width: 100, height: 100 },
      "e",
      { points: [[150, 50]] },
      { threshold: 50 } // Very loose snap
    );

    const state1 = sim.dragTo([110, 0]); // Right edge at 110, distance to 150 is 40
    expect(state1.snapped).toBe(true);
    expect(state1.resultRect.x + state1.resultRect.width).toBe(150);

    const state2 = sim.dragTo([105, 0]); // Right edge at 105, distance to 150 is 45
    expect(state2.snapped).toBe(true); // Still within large threshold
    expect(state2.resultRect.x + state2.resultRect.width).toBe(150);
  });
});
