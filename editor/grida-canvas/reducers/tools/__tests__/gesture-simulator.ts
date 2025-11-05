import cmath from "@grida/cmath";
import { calculateResizeSnap } from "../snap-resize";

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
export class ResizeGestureSimulator {
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

    // Calculate origin based on direction if not provided
    this.origin = this.calculateOrigin(
      initial,
      direction,
      options.centerOrigin
    );

    // Extract anchor points from guides and points
    this.anchors = [];
    if (anchors.points) {
      this.anchors.push(...anchors.points);
    }
    if (anchors.guides) {
      // For guides, we need to extract relevant points based on direction
      // This is a simplified version - in reality, guides create infinite snap lines
      anchors.guides.forEach((guide) => {
        if (guide.axis === "x") {
          // Vertical guide at x=offset
          this.anchors.push([guide.offset, 0]);
          this.anchors.push([guide.offset, initial.height]);
        } else {
          // Horizontal guide at y=offset
          this.anchors.push([0, guide.offset]);
          this.anchors.push([initial.width, guide.offset]);
        }
      });
    }
  }

  /**
   * Calculate the transform origin based on direction and center-origin mode
   */
  private calculateOrigin(
    rect: cmath.Rectangle,
    direction: cmath.CardinalDirection,
    centerOrigin: boolean = false
  ): cmath.Vector2 {
    if (centerOrigin) {
      return [rect.x + rect.width / 2, rect.y + rect.height / 2];
    }

    // Origin is the opposite corner/edge from the resize handle
    const opposite = cmath.compass.invertDirection(direction);
    return cmath.rect.getCardinalPoint(rect, opposite);
  }

  /**
   * Simulate dragging the resize handle to a specific position.
   * The position represents where the handle (edge/corner) should be.
   */
  dragTo(handlePosition: cmath.Vector2): GestureState {
    // Get the initial handle position
    const initialHandlePos = cmath.rect.getCardinalPoint(
      this.initial,
      this.direction
    );

    // Calculate movement as the difference from initial handle position
    const movement = cmath.vector2.sub(handlePosition, initialHandlePos);

    return this.applyMovement(movement);
  }

  /**
   * Simulate dragging by a movement delta
   */
  dragBy(delta: cmath.Vector2): GestureState {
    this.currentMovement = cmath.vector2.add(this.currentMovement, delta);
    return this.applyMovement(this.currentMovement);
  }

  /**
   * Apply movement and calculate snap
   */
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

    // Calculate the result rectangle
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

  /**
   * Get the current snap state
   */
  getSnapState(): GestureState | null {
    return this.lastSnapState;
  }

  /**
   * Reset the simulator to initial state
   */
  reset(): void {
    this.currentMovement = [0, 0];
    this.lastSnapState = null;
  }

  /**
   * Check if currently snapped
   */
  isSnapped(): boolean {
    return this.lastSnapState?.snapped ?? false;
  }

  /**
   * Get the snap delta
   */
  getSnapDelta(): cmath.Vector2 {
    return this.lastSnapState?.snapDelta ?? [0, 0];
  }
}
