import cmath from "@grida/cmath";
import { SnapResult } from "@grida/cmath/_snap";
import grida from "@grida/schema";

const q = 1;

type SnapObjectsResult = SnapResult<{
  objects: cmath.Rectangle[];
  guides: grida.program.document.Guide2D[];
}>;

/**
 * Get the indices of the 9-point geometry that are moving for a given resize direction.
 *
 * 9-point indices:
 * 0: top-left, 1: top-center, 2: top-right
 * 3: mid-left, 4: center, 5: mid-right
 * 6: bottom-left, 7: bottom-center, 8: bottom-right
 *
 * @param direction - The resize handle direction
 * @param centerOrigin - Whether resizing from center (both sides move)
 * @returns Array of indices (0-8) that represent moving points
 */
function getMoving9PointIndices(
  direction: cmath.CardinalDirection,
  centerOrigin: boolean
): number[] {
  if (centerOrigin) {
    // In center origin mode, opposite edges also move
    switch (direction) {
      case "e":
      case "w":
        return [3, 5]; // left and right mid points
      case "n":
      case "s":
        return [1, 7]; // top and bottom mid points
      case "ne":
      case "se":
      case "nw":
      case "sw":
        return [0, 1, 2, 3, 5, 6, 7, 8]; // All except center
    }
  }

  // Regular resize (one side moves)
  switch (direction) {
    case "e":
      return [2, 5, 8]; // Right edge: top-right, mid-right, bottom-right
    case "w":
      return [0, 3, 6]; // Left edge: top-left, mid-left, bottom-left
    case "n":
      return [0, 1, 2]; // Top edge: top-left, top-center, top-right
    case "s":
      return [6, 7, 8]; // Bottom edge: bottom-left, bottom-center, bottom-right
    case "ne":
      return [0, 1, 2, 5, 8]; // Top edge (0,1,2) + right edge (2,5,8)
    case "se":
      return [2, 5, 6, 7, 8]; // Right edge (2,5,8) + bottom edge (6,7,8)
    case "nw":
      return [0, 1, 2, 3, 6]; // Top edge (0,1,2) + left edge (0,3,6)
    case "sw":
      return [0, 3, 6, 7, 8]; // Left edge (0,3,6) + bottom edge (6,7,8)
  }
}

/**
 * Get the snap points for a rectangle being resized in a specific direction.
 *
 * For edge handles (E, W, N, S), returns 3 points along that edge.
 * For corner handles (NE, SE, NW, SW), returns the corner point plus edge points.
 * In center-origin mode, includes points from both sides since both move.
 */
export function getResizeSnapPoints(
  rect: cmath.Rectangle,
  direction: cmath.CardinalDirection,
  origin: cmath.Vector2,
  movement: cmath.Vector2,
  centerOrigin: boolean
): cmath.Vector2[] {
  const points: cmath.Vector2[] = [];

  // Calculate the virtually resized rectangle
  // Apply direction vector to movement to get size change
  const direction_vector = cmath.compass.cardinal_direction_vector[direction];
  const movement_multiplier = centerOrigin ? 2 : 1;

  const size_delta: cmath.Vector2 = [
    direction_vector[0] * movement[0] * movement_multiplier,
    direction_vector[1] * movement[1] * movement_multiplier,
  ];

  const scale = cmath.rect.getScaleFactors(rect, {
    x: rect.x,
    y: rect.y,
    width: rect.width + size_delta[0],
    height: rect.height + size_delta[1],
  });

  const virtual_rect = cmath.rect.scale(rect, origin, scale);

  // Helper to get 3 points along an edge
  const get3PointsOnEdge = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): cmath.Vector2[] => {
    return [
      [x1, y1],
      [(x1 + x2) / 2, (y1 + y2) / 2],
      [x2, y2],
    ];
  };

  // Extract points based on direction
  switch (direction) {
    case "e": {
      // Right edge
      const right_x = virtual_rect.x + virtual_rect.width;
      points.push(
        ...get3PointsOnEdge(
          right_x,
          virtual_rect.y,
          right_x,
          virtual_rect.y + virtual_rect.height
        )
      );
      if (centerOrigin) {
        // Also include left edge
        points.push(
          ...get3PointsOnEdge(
            virtual_rect.x,
            virtual_rect.y,
            virtual_rect.x,
            virtual_rect.y + virtual_rect.height
          )
        );
      }
      break;
    }
    case "w": {
      // Left edge
      points.push(
        ...get3PointsOnEdge(
          virtual_rect.x,
          virtual_rect.y,
          virtual_rect.x,
          virtual_rect.y + virtual_rect.height
        )
      );
      if (centerOrigin) {
        // Also include right edge
        const right_x = virtual_rect.x + virtual_rect.width;
        points.push(
          ...get3PointsOnEdge(
            right_x,
            virtual_rect.y,
            right_x,
            virtual_rect.y + virtual_rect.height
          )
        );
      }
      break;
    }
    case "n": {
      // Top edge
      points.push(
        ...get3PointsOnEdge(
          virtual_rect.x,
          virtual_rect.y,
          virtual_rect.x + virtual_rect.width,
          virtual_rect.y
        )
      );
      if (centerOrigin) {
        // Also include bottom edge
        const bottom_y = virtual_rect.y + virtual_rect.height;
        points.push(
          ...get3PointsOnEdge(
            virtual_rect.x,
            bottom_y,
            virtual_rect.x + virtual_rect.width,
            bottom_y
          )
        );
      }
      break;
    }
    case "s": {
      // Bottom edge
      const bottom_y = virtual_rect.y + virtual_rect.height;
      points.push(
        ...get3PointsOnEdge(
          virtual_rect.x,
          bottom_y,
          virtual_rect.x + virtual_rect.width,
          bottom_y
        )
      );
      if (centerOrigin) {
        // Also include top edge
        points.push(
          ...get3PointsOnEdge(
            virtual_rect.x,
            virtual_rect.y,
            virtual_rect.x + virtual_rect.width,
            virtual_rect.y
          )
        );
      }
      break;
    }
    case "ne": {
      // Top-right corner
      const right_x = virtual_rect.x + virtual_rect.width;
      // Corner point
      points.push([right_x, virtual_rect.y]);
      // Top edge
      points.push(
        ...get3PointsOnEdge(
          virtual_rect.x,
          virtual_rect.y,
          right_x,
          virtual_rect.y
        )
      );
      // Right edge
      points.push(
        ...get3PointsOnEdge(
          right_x,
          virtual_rect.y,
          right_x,
          virtual_rect.y + virtual_rect.height
        )
      );
      break;
    }
    case "se": {
      // Bottom-right corner
      const right_x = virtual_rect.x + virtual_rect.width;
      const bottom_y = virtual_rect.y + virtual_rect.height;
      // Corner point
      points.push([right_x, bottom_y]);
      // Right edge
      points.push(
        ...get3PointsOnEdge(right_x, virtual_rect.y, right_x, bottom_y)
      );
      // Bottom edge
      points.push(
        ...get3PointsOnEdge(virtual_rect.x, bottom_y, right_x, bottom_y)
      );
      break;
    }
    case "nw": {
      // Top-left corner
      // Corner point
      points.push([virtual_rect.x, virtual_rect.y]);
      // Top edge
      points.push(
        ...get3PointsOnEdge(
          virtual_rect.x,
          virtual_rect.y,
          virtual_rect.x + virtual_rect.width,
          virtual_rect.y
        )
      );
      // Left edge
      points.push(
        ...get3PointsOnEdge(
          virtual_rect.x,
          virtual_rect.y,
          virtual_rect.x,
          virtual_rect.y + virtual_rect.height
        )
      );
      break;
    }
    case "sw": {
      // Bottom-left corner
      const bottom_y = virtual_rect.y + virtual_rect.height;
      // Corner point
      points.push([virtual_rect.x, bottom_y]);
      // Left edge
      points.push(
        ...get3PointsOnEdge(
          virtual_rect.x,
          virtual_rect.y,
          virtual_rect.x,
          bottom_y
        )
      );
      // Bottom edge
      points.push(
        ...get3PointsOnEdge(
          virtual_rect.x,
          bottom_y,
          virtual_rect.x + virtual_rect.width,
          bottom_y
        )
      );
      break;
    }
  }

  // Remove duplicates
  const unique_points = points.filter((p, i, arr) => {
    return arr.findIndex((q) => q[0] === p[0] && q[1] === p[1]) === i;
  });

  return unique_points;
}

/**
 * Calculate the movement adjustment needed to apply snap delta.
 *
 * When aspect ratio is preserved, adjusts both axes proportionally.
 *
 * @param snapDelta - The snap delta applied to the agent points
 * @param originalMovement - The original movement before snap adjustment
 * @param rectBeforeSnap - The initial rectangle
 * @param options - Options including preserveAspectRatio
 */
export function adjustMovementForSnap(
  snapDelta: cmath.Vector2,
  direction: cmath.CardinalDirection,
  origin: cmath.Vector2,
  rectBeforeSnap: cmath.Rectangle,
  options: {
    preserveAspectRatio?: boolean;
    originalMovement?: cmath.Vector2;
  } = {}
): cmath.Vector2 {
  const { preserveAspectRatio = false, originalMovement } = options;

  // If no snap, return zero adjustment
  if (snapDelta[0] === 0 && snapDelta[1] === 0) {
    return [0, 0];
  }

  if (!preserveAspectRatio || !originalMovement) {
    // Direct adjustment
    return snapDelta;
  }

  // With aspect ratio preservation, we need to adjust both axes proportionally
  const aspect_ratio = rectBeforeSnap.width / rectBeforeSnap.height;

  // Determine which axis snapped (has non-zero delta)
  const x_snapped = Math.abs(snapDelta[0]) > 0;
  const y_snapped = Math.abs(snapDelta[1]) > 0;

  if (x_snapped && !y_snapped) {
    // X snapped, calculate what y should be to maintain aspect ratio
    const new_x_movement = originalMovement[0] + snapDelta[0];
    const new_y_movement = new_x_movement / aspect_ratio;
    const y_adjustment = new_y_movement - originalMovement[1];
    return [snapDelta[0], y_adjustment];
  } else if (y_snapped && !x_snapped) {
    // Y snapped, calculate what x should be to maintain aspect ratio
    const new_y_movement = originalMovement[1] + snapDelta[1];
    const new_x_movement = new_y_movement * aspect_ratio;
    const x_adjustment = new_x_movement - originalMovement[0];
    return [x_adjustment, snapDelta[1]];
  } else {
    // Both snapped or neither snapped
    return snapDelta;
  }
}

interface CalculateResizeSnapParams {
  initial: cmath.Rectangle;
  direction: cmath.CardinalDirection;
  origin: cmath.Vector2;
  movement: cmath.Vector2;
  anchors: cmath.Vector2[];
  threshold: number;
  options?: {
    preserveAspectRatio?: boolean;
    centerOrigin?: boolean;
  };
}

interface CalculateResizeSnapResult {
  adjustedMovement: cmath.Vector2;
  snapDelta: cmath.Vector2;
  snappedPoints: {
    agent: cmath.Vector2[];
    anchor: cmath.Vector2[];
  };
  /** Indices of agent points that participated in the snap */
  hitAgentIndices: {
    x: number[];
    y: number[];
  };
  /** Indices of anchor points that participated in the snap */
  hitAnchorIndices: {
    x: number[];
    y: number[];
  };
}

/**
 * Core resize snap calculation.
 *
 * Given a rectangle being resized, calculates the movement adjustment needed
 * to snap to nearby anchor points.
 *
 * @returns Adjusted movement and snap information
 */
export function calculateResizeSnap(
  params: CalculateResizeSnapParams
): CalculateResizeSnapResult {
  const {
    initial,
    direction,
    origin,
    movement,
    anchors,
    threshold,
    options = {},
  } = params;

  const { preserveAspectRatio = false, centerOrigin = false } = options;

  // If no anchors, return original movement
  if (anchors.length === 0) {
    return {
      adjustedMovement: movement,
      snapDelta: [0, 0],
      snappedPoints: {
        agent: [],
        anchor: [],
      },
      hitAgentIndices: {
        x: [],
        y: [],
      },
      hitAnchorIndices: {
        x: [],
        y: [],
      },
    };
  }

  // Get snap points for this resize operation
  const agent_points = getResizeSnapPoints(
    initial,
    direction,
    origin,
    movement,
    centerOrigin
  );

  // Determine which axes are active based on direction
  const is_horizontal =
    direction === "e" ||
    direction === "w" ||
    direction === "ne" ||
    direction === "se" ||
    direction === "nw" ||
    direction === "sw";
  const is_vertical =
    direction === "n" ||
    direction === "s" ||
    direction === "ne" ||
    direction === "se" ||
    direction === "nw" ||
    direction === "sw";

  // Extract anchor points by axis
  const x_anchors = is_horizontal ? anchors.map((p) => p[0]) : [];
  const y_anchors = is_vertical ? anchors.map((p) => p[1]) : [];

  const x_agents = agent_points.map((p) => p[0]);
  const y_agents = agent_points.map((p) => p[1]);

  // Perform 1D snapping on each axis
  let x_snap_result: cmath.ext.snap.Snap1DResult | null = null;
  let y_snap_result: cmath.ext.snap.Snap1DResult | null = null;

  // With aspect ratio, determine dominant axis and only snap that
  let snap_axis: "x" | "y" | "both" = "both";
  if (preserveAspectRatio && is_horizontal && is_vertical) {
    // Determine dominant axis based on movement magnitude
    snap_axis = Math.abs(movement[0]) > Math.abs(movement[1]) ? "x" : "y";
  }

  if (is_horizontal && x_anchors.length > 0 && snap_axis !== "y") {
    x_snap_result = cmath.ext.snap.snap1D(x_agents, x_anchors, threshold, 0);
  }

  if (is_vertical && y_anchors.length > 0 && snap_axis !== "x") {
    y_snap_result = cmath.ext.snap.snap1D(y_agents, y_anchors, threshold, 0);
  }

  // Calculate snap delta
  const snap_delta: cmath.Vector2 = [
    x_snap_result && x_snap_result.distance !== Infinity
      ? x_snap_result.distance
      : 0,
    y_snap_result && y_snap_result.distance !== Infinity
      ? y_snap_result.distance
      : 0,
  ];

  // Calculate movement adjustment
  const movement_adjustment = adjustMovementForSnap(
    snap_delta,
    direction,
    origin,
    initial,
    { preserveAspectRatio, originalMovement: movement }
  );

  // Adjusted movement
  const adjusted_movement: cmath.Vector2 = [
    movement[0] + movement_adjustment[0],
    movement[1] + movement_adjustment[1],
  ];

  // Collect snapped points and indices for visual feedback
  const snapped_agent_points: cmath.Vector2[] = [];
  const snapped_anchor_points: cmath.Vector2[] = [];
  const hit_agent_indices_x: number[] = [];
  const hit_agent_indices_y: number[] = [];
  const hit_anchor_indices_x: number[] = [];
  const hit_anchor_indices_y: number[] = [];

  if (x_snap_result && x_snap_result.distance !== Infinity) {
    x_snap_result.hit_agent_indices.forEach((idx) => {
      snapped_agent_points.push(agent_points[idx]);
      hit_agent_indices_x.push(idx);
    });
    x_snap_result.hit_anchor_indices.forEach((idx) => {
      snapped_anchor_points.push(anchors[idx]);
      hit_anchor_indices_x.push(idx);
    });
  }

  if (y_snap_result && y_snap_result.distance !== Infinity) {
    y_snap_result.hit_agent_indices.forEach((idx) => {
      snapped_agent_points.push(agent_points[idx]);
      hit_agent_indices_y.push(idx);
    });
    y_snap_result.hit_anchor_indices.forEach((idx) => {
      snapped_anchor_points.push(anchors[idx]);
      hit_anchor_indices_y.push(idx);
    });
  }

  return {
    adjustedMovement: adjusted_movement,
    snapDelta: snap_delta,
    snappedPoints: {
      agent: snapped_agent_points,
      anchor: snapped_anchor_points,
    },
    hitAgentIndices: {
      x: hit_agent_indices_x,
      y: hit_agent_indices_y,
    },
    hitAnchorIndices: {
      x: hit_anchor_indices_x,
      y: hit_anchor_indices_y,
    },
  };
}

/**
 * Main universal function for resizing objects with optional snapping.
 *
 * Bridges editor state to snap calculations, extracting anchor points from
 * objects and guides, then formatting results for editor consumption.
 *
 * @param agents - Objects being resized
 * @param anchors - Snap targets (objects and guides)
 * @param direction - Resize handle direction
 * @param origin - Transform origin point
 * @param movement - Raw movement from gesture
 * @param threshold - Snap threshold
 * @param options - Resize options
 * @returns Adjusted movement and snap result
 */
export function snapObjectsResize(
  agents: cmath.Rectangle[],
  anchors: {
    objects?: cmath.Rectangle[];
    guides?: grida.program.document.Guide2D[];
  },
  direction: cmath.CardinalDirection,
  origin: cmath.Vector2,
  movement: cmath.Vector2,
  threshold: number,
  options: {
    enabled?: boolean;
    preserveAspectRatio?: boolean;
    centerOrigin?: boolean;
  } = {}
): {
  adjusted_movement: cmath.Vector2;
  snapping: SnapObjectsResult | undefined;
} {
  const {
    enabled = true,
    preserveAspectRatio = false,
    centerOrigin = false,
  } = options;

  // If snapping is disabled, return original movement
  if (!enabled) {
    return {
      adjusted_movement: movement,
      snapping: undefined,
    };
  }

  // Quantize inputs
  const agents_q = agents.map((r) => cmath.rect.quantize(r, q));
  const anchor_objects_q =
    anchors.objects?.map((r) => cmath.rect.quantize(r, q)) ?? [];

  // Calculate bounding box of all agents
  const bounding_rect = cmath.rect.union(agents_q);

  // Extract anchor points from objects and guides
  const anchor_points: cmath.Vector2[] = [];

  // From objects: extract 9-point geometry
  anchor_objects_q.forEach((rect) => {
    const points_9 = cmath.rect.to9PointsChunk(rect);
    anchor_points.push(...points_9);
  });

  // From guides: extract points along the guide
  if (anchors.guides) {
    anchors.guides.forEach((guide) => {
      // For a guide, we create anchor points along the line
      // This is a simplified approach - guides are essentially infinite snap lines
      if (guide.axis === "x") {
        // Vertical guide at x=offset
        anchor_points.push([guide.offset, bounding_rect.y]);
        anchor_points.push([
          guide.offset,
          bounding_rect.y + bounding_rect.height,
        ]);
        anchor_points.push([
          guide.offset,
          bounding_rect.y + bounding_rect.height / 2,
        ]);
      } else {
        // Horizontal guide at y=offset
        anchor_points.push([bounding_rect.x, guide.offset]);
        anchor_points.push([
          bounding_rect.x + bounding_rect.width,
          guide.offset,
        ]);
        anchor_points.push([
          bounding_rect.x + bounding_rect.width / 2,
          guide.offset,
        ]);
      }
    });
  }

  // Call core snap calculation
  const result = calculateResizeSnap({
    initial: bounding_rect,
    direction,
    origin,
    movement,
    anchors: anchor_points,
    threshold,
    options: {
      preserveAspectRatio,
      centerOrigin,
    },
  });

  // Calculate the actual resized bounding rect after snap adjustment
  // This is needed for visual snap guide rendering
  const direction_vector = cmath.compass.cardinal_direction_vector[direction];
  const multiplier = centerOrigin ? 2 : 1;
  const size_delta: cmath.Vector2 = [
    direction_vector[0] * result.adjustedMovement[0] * multiplier,
    direction_vector[1] * result.adjustedMovement[1] * multiplier,
  ];

  const scale_factors = cmath.rect.getScaleFactors(bounding_rect, {
    x: bounding_rect.x,
    y: bounding_rect.y,
    width: bounding_rect.width + size_delta[0],
    height: bounding_rect.height + size_delta[1],
  });

  const resized_bounding_rect = cmath.rect.positive(
    cmath.rect.scale(bounding_rect, origin, scale_factors)
  );

  // Format snap result for editor consumption
  let snapping: SnapObjectsResult | undefined;

  if (result.snapDelta[0] !== 0 || result.snapDelta[1] !== 0) {
    // Get indices of 9-point geometry that represent MOVING parts
    // This prevents highlighting non-moving parts that happen to be aligned
    const moving_indices = getMoving9PointIndices(direction, centerOrigin);
    const moving_indices_set = new Set(moving_indices);

    // Extract 9-point geometry from the resized rect
    const resized_9points = cmath.rect.to9PointsChunk(resized_bounding_rect);

    // Map snapped agent points back to 9-point geometry
    // CRITICAL: Only mark points that are MOVING parts for this resize direction
    const agent_hit_points = resized_9points.map((point, index) => {
      // First check: Is this a moving point for this resize direction?
      if (!moving_indices_set.has(index)) {
        // This is a non-moving part (e.g., top edge when resizing bottom)
        // Don't highlight it even if it happens to be aligned
        return [false, false] as [boolean, boolean];
      }

      // Second check: Did this moving point actually snap?
      const did_snap = result.snappedPoints.agent.some(
        (snapped_p) =>
          Math.abs(snapped_p[0] - point[0]) < 0.1 &&
          Math.abs(snapped_p[1] - point[1]) < 0.1
      );

      if (!did_snap) {
        // Moving point was checked but didn't snap
        return [false, false] as [boolean, boolean];
      }

      // This moving point actually snapped - mark which axes
      const x_hit = result.snapDelta[0] !== 0;
      const y_hit = result.snapDelta[1] !== 0;
      return [x_hit, y_hit] as [boolean, boolean];
    });

    // Map snapped anchor points back to anchor 9-point geometry
    const anchor_hit_points = anchor_objects_q.map((anchor) => {
      const anchor_9points = cmath.rect.to9PointsChunk(anchor);
      return anchor_9points.map((point) => {
        // Check if this anchor point was actually involved in the snap
        const point_was_snapped = result.snappedPoints.anchor.some(
          (snapped_p) =>
            Math.abs(snapped_p[0] - point[0]) < 0.1 &&
            Math.abs(snapped_p[1] - point[1]) < 0.1
        );

        if (!point_was_snapped) {
          return [false, false] as [boolean, boolean];
        }

        const x_hit = result.snapDelta[0] !== 0;
        const y_hit = result.snapDelta[1] !== 0;
        return [x_hit, y_hit] as [boolean, boolean];
      });
    });

    // Convert snap result to editor format
    snapping = {
      anchors: { objects: anchor_objects_q, guides: anchors.guides ?? [] },
      delta: result.snapDelta,
      by_objects:
        anchor_objects_q.length > 0
          ? {
              translated: resized_bounding_rect, // The actual resized rect after snap
              x:
                result.snapDelta[0] !== 0
                  ? {
                      distance: result.snapDelta[0],
                      hit_agent_indices: [],
                      hit_anchor_indices: [],
                    }
                  : null,
              y:
                result.snapDelta[1] !== 0
                  ? {
                      distance: result.snapDelta[1],
                      hit_agent_indices: [],
                      hit_anchor_indices: [],
                    }
                  : null,
              hit_points: {
                agent: agent_hit_points,
                anchors: anchor_hit_points,
              },
            }
          : false,
      by_objects_spacing: false,
      by_guides:
        anchors.guides && anchors.guides.length > 0
          ? {
              x:
                result.snapDelta[0] !== 0
                  ? {
                      distance: result.snapDelta[0],
                      hit_agent_indices: [],
                      hit_anchor_indices: [],
                      // Find which guides were involved in x-axis snap
                      aligned_anchors_idx: anchors.guides
                        .map((guide, idx) => (guide.axis === "x" ? idx : -1))
                        .filter((idx) => idx >= 0),
                    }
                  : null,
              y:
                result.snapDelta[1] !== 0
                  ? {
                      distance: result.snapDelta[1],
                      hit_agent_indices: [],
                      hit_anchor_indices: [],
                      // Find which guides were involved in y-axis snap
                      aligned_anchors_idx: anchors.guides
                        .map((guide, idx) => (guide.axis === "y" ? idx : -1))
                        .filter((idx) => idx >= 0),
                    }
                  : null,
            }
          : false,
      by_points: false,
    } as any;
  }

  return {
    adjusted_movement: result.adjustedMovement,
    snapping,
  };
}
