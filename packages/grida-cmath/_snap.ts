import assert from "assert";
import cmath from "./index";

interface IDistance {
  distance: number;
}

function bestDistance(...distances: (number | undefined)[]): number {
  let min_distance = Infinity;
  for (const distance of distances) {
    if (distance === undefined) continue;
    if (Math.abs(distance) < Math.abs(min_distance)) {
      min_distance = distance;
    }
  }
  return min_distance;
}

function bestAxisAlignedDistance(
  ...results: (IDistance | null | undefined)[]
): IDistance | null | undefined {
  let min_distance = Infinity;
  let min_index = -1;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result) continue;
    if (Math.abs(result.distance) < Math.abs(min_distance)) {
      min_distance = result.distance;
      min_index = i;
    }
    // TODO: support multiple results, merge them if the distance is the same (or within tolerance)
    // else if (result.distance === min_distance) { }
  }

  if (min_index === -1) {
    return results[0];
  }

  return results[min_index];
}

type SnapAnchors = {
  points?: cmath.Vector2[];
  objects?: cmath.Rectangle[];
  guides?: Guide[];
};

/**
 * Snap results from object geometry (9-point snapping).
 *
 * Contains information about how the agent snapped to object geometry,
 * including the translated position and hit points for both agent and anchors.
 */
type ByObjectsResult = {
  /**
   * The translated rectangle after snapping.
   *
   * Returns the original agent when not snapped (delta 0)
   */
  translated: cmath.Rectangle;
  /**
   * Snap result for the X-axis. Null if no snapping occurred on this axis.
   */
  x: cmath.ext.snap.Snap1DResult | null;
  /**
   * Snap result for the Y-axis. Null if no snapping occurred on this axis.
   */
  y: cmath.ext.snap.Snap1DResult | null;
  /**
   * Hit point information for both agent and anchor objects.
   * Used for rendering snap guides and visual feedback.
   */
  hit_points: {
    agent: Object9PointGeometryHitResult;
    anchors: Object9PointGeometryHitResult[];
  };
};

/**
 * Snap results from object spacing (distribution geometry).
 *
 * Contains information about how the agent snapped to object spacing patterns,
 * including distribution geometry and aligned anchor indices.
 */
type ByObjectsSpacingResult = {
  /**
   * Snap result for the X-axis spacing. Null if no spacing snapping occurred on this axis.
   */
  x:
    | (Snap1DRangesDirectionAlignedResult & {
        aligned_anchors_idx: number[];
      })
    | null;
  /**
   * Snap result for the Y-axis spacing. Null if no spacing snapping occurred on this axis.
   */
  y:
    | (Snap1DRangesDirectionAlignedResult & {
        aligned_anchors_idx: number[];
      })
    | null;
};

/**
 * Snap results from guides (axis-aligned lines).
 *
 * Contains information about how the agent snapped to guide lines,
 * including snap results and aligned anchor indices for each axis.
 */
type ByGuidesResult = {
  /**
   * Snap result for the X-axis guides. Null if no guide snapping occurred on this axis.
   */
  x: (cmath.ext.snap.Snap1DResult & { aligned_anchors_idx: number[] }) | null;
  /**
   * Snap result for the Y-axis guides. Null if no guide snapping occurred on this axis.
   */
  y: (cmath.ext.snap.Snap1DResult & { aligned_anchors_idx: number[] }) | null;
};

/**
 * Snap results from point anchors.
 *
 * Contains information about how the agent points snapped to anchor points,
 * including hit indices for both agent and anchors.
 */
type ByPointsResult = {
  /**
   * The translated points after snapping.
   */
  translated: cmath.Vector2[];
  /**
   * Snap result for the X-axis. Null if no snapping occurred on this axis.
   */
  x: cmath.ext.snap.Snap1DResult | null;
  /**
   * Snap result for the Y-axis. Null if no snapping occurred on this axis.
   */
  y: cmath.ext.snap.Snap1DResult | null;
  /**
   * Hit point information for both agent and anchor points.
   */
  hit_points: {
    agent: [boolean, boolean][];
    anchors: [boolean, boolean][];
  };
};

/**
 * Smart-typed snap result that adapts its properties based on the anchors provided.
 *
 * This type uses conditional types to provide better type safety:
 * - When `TAnchors` includes `objects`, `by_objects` and `by_objects_spacing` are never `false`
 * - When `TAnchors` includes `guides`, `by_guides` is never `false`
 * - When neither are provided, all properties may be `false`
 *
 * @template TAnchors - The type of anchors used for snapping. Automatically inferred by the function.
 */
export type SnapResult<TAnchors extends SnapAnchors = SnapAnchors> = {
  /**
   * The original anchors that were used as references for snapping.
   */
  anchors: TAnchors;

  /**
   * The calculated delta for snapping - the movement vector to apply to the agent.
   */
  delta: cmath.Vector2;

  // TODO: group by x/y, allow multiple results by type (if matches)
  // x: SnapToObjectsAxisResult [{ type: 'by_objects': ... }, ...]

  // by_points: {} | false

  /**
   * Snap results from object geometry (9-point snapping).
   *
   * **Smart typing**: This is never `false` when `anchors.objects` is provided.
   * When `false`, it means no object geometry snapping occurred.
   */
  by_objects: TAnchors extends { objects: cmath.Rectangle[] }
    ? ByObjectsResult
    : ByObjectsResult | false;

  /**
   * Snap results from object spacing (distribution geometry).
   *
   * **Smart typing**: This is never `false` when `anchors.objects` is provided.
   * When `false`, it means no object spacing snapping occurred.
   */
  by_objects_spacing: TAnchors extends { objects: cmath.Rectangle[] }
    ? ByObjectsSpacingResult
    : ByObjectsSpacingResult | false;

  /**
   * Snap results from guides (axis-aligned lines).
   *
   * **Smart typing**: This is never `false` when `anchors.guides` is provided.
   * When `false`, it means no guide snapping occurred.
   */
  by_guides: TAnchors extends { guides: Guide[] }
    ? ByGuidesResult
    : ByGuidesResult | false;

  /**
   * Snap results from point anchors.
   *
   * **Smart typing**: This is never `false` when `anchors.points` is provided
   * and the agent contains at least one point. When `false`, it means no point
   * snapping occurred.
   */
  by_points: TAnchors extends { points: cmath.Vector2[] }
    ? ByPointsResult
    : ByPointsResult | false;
};

const dist2delta = (dist: number | undefined) =>
  dist === undefined || dist === Infinity ? 0 : dist;

type Guide = {
  axis: cmath.Axis;
  offset: number;
};

/**
 * Snaps a rectangle (agent) to canvas geometry including objects and guides.
 *
 * This function uses smart typing to provide better type safety based on the anchors provided:
 * - When `objects` are provided in anchors, `by_objects` and `by_objects_spacing` will never be `false`
 * - When `guides` are provided in anchors, `by_guides` will never be `false`
 * - When neither are provided, all result properties may be `false`
 *
 * @template TAnchors - The type of anchors provided. Automatically inferred from the anchors parameter.
 * @param agent - The rectangle to snap (the moving/target object)
 * @param anchors - Snap targets. Can include objects (rectangles) and/or guides (axis-aligned lines)
 * @param config - Snap configuration specifying which axes to snap on and thresholds
 * @param tolerance - Additional tolerance for snapping (default: 0)
 *
 * @returns A smart-typed snap result where:
 * - `by_objects` is guaranteed to be non-false when `anchors.objects` is provided
 * - `by_objects_spacing` is guaranteed to be non-false when `anchors.objects` is provided
 * - `by_guides` is guaranteed to be non-false when `anchors.guides` is provided
 * - `delta` contains the calculated movement vector for snapping
 *
 * @example
 * ```typescript
 * // With objects only - by_objects and by_objects_spacing are never false
 * const result1 = snapToCanvasGeometry(agent, { objects: [rect1, rect2] }, config);
 * if (result1.by_objects) {
 *   // TypeScript knows this is always true when objects are provided
 *   console.log(result1.by_objects.translated);
 * }
 *
 * // With guides only - by_guides is never false
 * const result2 = snapToCanvasGeometry(agent, { guides: [guide1, guide2] }, config);
 * if (result2.by_guides) {
 *   // TypeScript knows this is always true when guides are provided
 *   console.log(result2.by_guides.x);
 * }
 *
 * // With both - all properties are never false
 * const result3 = snapToCanvasGeometry(agent, {
 *   objects: [rect1],
 *   guides: [guide1]
 * }, config);
 * // All properties are guaranteed to be non-false
 * ```
 */
export function snapToCanvasGeometry<
  TAnchors extends SnapAnchors = SnapAnchors,
>(
  agent: cmath.Rectangle | cmath.Vector2[],
  anchors: TAnchors,
  config: cmath.ext.snap.Snap2DAxisonfig,
  tolerance = 0
): SnapResult<TAnchors> {
  assert(agent, "Agent must be a valid rectangle.");
  // assert(
  //   anchors.objects.length > 0 || anchors.guides.length > 0,
  //   "Anchors must contain at least one rectangle or guide."
  // );

  const {
    objects: anchorObjects,
    guides: anchorGuides,
    points: anchorPoints,
  } = anchors;

  let snap_guide: SnapToGuidesResult | null = null;
  let snap_objgeo: SnapToObjects9PointsGeometryResult | null = null;
  let snap_objspc: SnapToObjectsSpaceResult | null = null;
  let snap_points: SnapToPointsResult | null = null;

  if (anchorGuides) {
    snap_guide = snapToGuides(agent, anchorGuides, config, tolerance);
  }

  if (anchorObjects && !Array.isArray(agent)) {
    snap_objgeo = snapToObjects9PointsGeometry(
      agent,
      anchorObjects,
      config,
      tolerance
    );
  }

  if (anchorPoints && Array.isArray(agent) && agent.length > 0) {
    snap_points = snapToPoints(agent, anchorPoints, config, tolerance);
  }

  const _sofar_bestx = bestDistance(
    snap_guide?.x?.distance,
    snap_objgeo?.x?.distance,
    snap_points?.x?.distance
  );

  const _sofar_besty = bestDistance(
    snap_guide?.y?.distance,
    snap_objgeo?.y?.distance,
    snap_points?.y?.distance
  );

  if (anchorObjects && !Array.isArray(agent)) {
    snap_objspc = snapToObjectsSpace(
      cmath.rect.translate(agent, [
        dist2delta(_sofar_bestx),
        dist2delta(_sofar_besty),
      ]),
      agent,
      anchorObjects,
      config,
      tolerance
    );
  }

  const x = bestAxisAlignedDistance(
    snap_guide?.x,
    snap_objgeo?.x,
    snap_objspc?.x,
    snap_points?.x
  );
  const y = bestAxisAlignedDistance(
    snap_guide?.y,
    snap_objgeo?.y,
    snap_objspc?.y,
    snap_points?.y
  );

  const x_delta = dist2delta(x?.distance);
  const y_delta = dist2delta(y?.distance);

  const translated_agent_rect = !Array.isArray(agent)
    ? cmath.rect.translate(agent, [x_delta, y_delta])
    : undefined;
  const translated_points = Array.isArray(agent)
    ? agent.map((p) => cmath.vector2.add(p, [x_delta, y_delta]))
    : undefined;

  return {
    anchors,
    by_objects: (snap_objgeo
      ? {
          translated: translated_agent_rect!,
          x: snap_objgeo.x?.distance === x?.distance ? snap_objgeo.x : null,
          y: snap_objgeo.y?.distance === y?.distance ? snap_objgeo.y : null,
          hit_points: {
            agent: snap_objgeo.agent_hits,
            anchors: snap_objgeo.anchor_hits,
          },
        }
      : false) as TAnchors extends { objects: cmath.Rectangle[] }
      ? ByObjectsResult
      : ByObjectsResult | false,
    by_objects_spacing: (snap_objspc
      ? {
          x: snap_objspc.x?.distance === x?.distance ? snap_objspc.x : null,
          y: snap_objspc.y?.distance === y?.distance ? snap_objspc.y : null,
        }
      : false) as TAnchors extends { objects: cmath.Rectangle[] }
      ? ByObjectsSpacingResult
      : ByObjectsSpacingResult | false,
    by_guides: (snap_guide ? snap_guide : false) as TAnchors extends {
      guides: Guide[];
    }
      ? ByGuidesResult
      : ByGuidesResult | false,
    by_points: (snap_points
      ? {
          translated: translated_points!,
          x: snap_points.x?.distance === x?.distance ? snap_points.x : null,
          y: snap_points.y?.distance === y?.distance ? snap_points.y : null,
          hit_points: {
            agent: snap_points.agent_hits,
            anchors: snap_points.anchor_hits,
          },
        }
      : false) as TAnchors extends { points: cmath.Vector2[] }
      ? ByPointsResult
      : ByPointsResult | false,
    delta: [x_delta, y_delta],
  };
}

type SnapToGuidesResult = {
  x: (cmath.ext.snap.Snap1DResult & { aligned_anchors_idx: number[] }) | null;
  y: (cmath.ext.snap.Snap1DResult & { aligned_anchors_idx: number[] }) | null;
};

function snapToGuides(
  agent: cmath.Rectangle | cmath.Vector2[],
  anchors: Guide[],
  config: cmath.ext.snap.Snap2DAxisonfig,
  tolerance = 0
): SnapToGuidesResult {
  let x_agent_points: number[];
  let y_agent_points: number[];

  if (Array.isArray(agent)) {
    x_agent_points = agent.map(([x]) => x);
    y_agent_points = agent.map(([_, y]) => y);
  } else {
    x_agent_points = cmath.range.to3PointsChunk(
      cmath.range.fromRectangle(agent, "x")
    );
    y_agent_points = cmath.range.to3PointsChunk(
      cmath.range.fromRectangle(agent, "y")
    );
  }

  const x_anchors: number[] = [];
  const y_anchors: number[] = [];
  const x_aligned_anchors_idx: number[] = [];
  const y_aligned_anchors_idx: number[] = [];

  for (let i = 0; i < anchors.length; i++) {
    const g = anchors[i];
    if (g.axis === "x") {
      x_anchors.push(g.offset);
      x_aligned_anchors_idx.push(i);
    } else {
      y_anchors.push(g.offset);
      y_aligned_anchors_idx.push(i);
    }
  }

  let x: cmath.ext.snap.Snap1DResult | null = null;
  if (config.x) {
    x = cmath.ext.snap.snap1D(x_agent_points, x_anchors, config.x, tolerance);
  }

  let y: cmath.ext.snap.Snap1DResult | null = null;
  if (config.y) {
    y = cmath.ext.snap.snap1D(y_agent_points, y_anchors, config.y, tolerance);
  }

  return {
    x: x ? { ...x, aligned_anchors_idx: x_aligned_anchors_idx } : null,
    y: y ? { ...y, aligned_anchors_idx: y_aligned_anchors_idx } : null,
  };
}

type Object9PointGeometryHitResult = cmath.rect.TRectangle9PointsChunk<
  [boolean, boolean]
>;

type SnapToObjects9PointsGeometryResult = {
  x: cmath.ext.snap.Snap1DResult | null;
  y: cmath.ext.snap.Snap1DResult | null;
  agent_hits: Object9PointGeometryHitResult;
  anchor_hits: Object9PointGeometryHitResult[];
  agent_points: cmath.Vector2[];
  anchor_points: cmath.ext.snap.AxisAlignedPoint[];
};

type SnapToPointsResult = {
  x: cmath.ext.snap.Snap1DResult | null;
  y: cmath.ext.snap.Snap1DResult | null;
  agent_hits: [boolean, boolean][];
  anchor_hits: [boolean, boolean][];
};

function snapToObjects9PointsGeometry(
  agent: cmath.Rectangle,
  anchors: cmath.Rectangle[],
  config: cmath.ext.snap.Snap2DAxisonfig,
  tolerance = 0
): SnapToObjects9PointsGeometryResult {
  const geometry_chunk_size = 9;
  // 1) snap to objects 9 points (each corner (4), center (1), and midpoints (4))
  const agent_points = cmath.rect.to9PointsChunk(agent);
  const anchor_points: cmath.ext.snap.AxisAlignedPoint[] = anchors
    .map((r) => cmath.rect.to9PointsChunk(r))
    .flat();

  const snap = cmath.ext.snap.snap2DAxisAligned(
    agent_points,
    anchor_points,
    config,
    tolerance
  );

  const agent_hits: Object9PointGeometryHitResult = agent_points.map(
    (point, index) => {
      const xHit = snap.x?.hit_agent_indices.includes(index) ?? false;
      const yHit = snap.y?.hit_agent_indices.includes(index) ?? false;
      return [xHit, yHit] satisfies [boolean, boolean];
    }
  ) as Object9PointGeometryHitResult;

  const anchor_hits: Object9PointGeometryHitResult[] = [];
  for (let i = 0; i < anchor_points.length; i += geometry_chunk_size) {
    const chunk = anchor_points.slice(i, i + geometry_chunk_size);
    const hitResult = chunk.map((point, index) => {
      const pointIndex = i + index;
      const xHit = snap.x?.hit_anchor_indices.includes(pointIndex);
      const yHit = snap.y?.hit_anchor_indices.includes(pointIndex);
      return [xHit, yHit];
    });
    anchor_hits.push(hitResult as Object9PointGeometryHitResult);
  }

  return {
    agent_hits,
    anchor_hits,
    agent_points,
    anchor_points,
    x: snap.x,
    y: snap.y,
  };
}

function snapToPoints(
  agent: cmath.Vector2[],
  anchors: cmath.Vector2[],
  config: cmath.ext.snap.Snap2DAxisonfig,
  tolerance = 0
): SnapToPointsResult {
  const snap = cmath.ext.snap.snap2DAxisAligned(
    agent,
    anchors,
    config,
    tolerance
  );

  const agent_hits = agent.map((_, index) => {
    const xHit = snap.x?.hit_agent_indices.includes(index) ?? false;
    const yHit = snap.y?.hit_agent_indices.includes(index) ?? false;
    return [xHit, yHit] as [boolean, boolean];
  });

  const anchor_hits = anchors.map((_, index) => {
    const xHit = snap.x?.hit_anchor_indices.includes(index) ?? false;
    const yHit = snap.y?.hit_anchor_indices.includes(index) ?? false;
    return [xHit, yHit] as [boolean, boolean];
  });

  return {
    x: snap.x,
    y: snap.y,
    agent_hits,
    anchor_hits,
  };
}

type SnapToObjectsSpaceResult = ReturnType<typeof snapToObjectsSpace>;

/**
 * @param intersectionTest the additionally translated agent, only used for alignment (range intersection testing)
 * @param agent the agent as-is
 * @param anchors
 * @param threshold
 * @param tolerance
 * @returns
 */
function snapToObjectsSpace(
  intersectionTest: cmath.Rectangle,
  agent: cmath.Rectangle,
  anchors: cmath.Rectangle[],
  config: cmath.ext.snap.Snap2DAxisonfig,
  tolerance = 0
) {
  // Define the agent's ranges on both axes
  const x_test_range: cmath.Range = [
    intersectionTest.x,
    intersectionTest.x + agent.width,
  ];
  const y_test_range: cmath.Range = [
    intersectionTest.y,
    intersectionTest.y + agent.height,
  ];
  const x_range: cmath.Range = [agent.x, agent.x + agent.width];
  const y_range: cmath.Range = [agent.y, agent.y + agent.height];

  // Filter anchors that overlap with the agent's ranges
  // store them as a index so we can locate the original anchor (rectangle) later
  const x_aligned_anchors_idx = anchors.reduce((acc, a, index) => {
    const a_y_range: cmath.Range = [a.y, a.y + a.height];
    if (cmath.vector2.intersects(y_test_range, a_y_range)) acc.push(index);
    return acc;
  }, [] as number[]);

  const y_aligned_anchors_idx = anchors.reduce((acc, a, index) => {
    const a_x_range: cmath.Range = [a.x, a.x + a.width];
    if (cmath.vector2.intersects(x_test_range, a_x_range)) acc.push(index);
    return acc;
  }, [] as number[]);

  // Extract ranges for snapping
  const x_aligned_anchor_ranges = x_aligned_anchors_idx.map((idx) => {
    const r = anchors[idx];
    return [r.x, r.x + r.width] satisfies cmath.Range;
  });

  const y_aligned_anchor_ranges = y_aligned_anchors_idx.map((idx) => {
    const r = anchors[idx];
    return [r.y, r.y + r.height] satisfies cmath.Range;
  });

  let x: Snap1DRangesDirectionAlignedResult | null = null;
  let y: Snap1DRangesDirectionAlignedResult | null = null;
  if (config.x) {
    x = snap1DRangesDirectionAlignedWithDistributionGeometry(
      x_range,
      x_aligned_anchor_ranges,
      config.x,
      tolerance
    );
  }

  if (config.y) {
    y = snap1DRangesDirectionAlignedWithDistributionGeometry(
      y_range,
      y_aligned_anchor_ranges,
      config.y,
      tolerance
    );
  }

  return {
    x: x ? { ...x, aligned_anchors_idx: x_aligned_anchors_idx } : null,
    y: y ? { ...y, aligned_anchors_idx: y_aligned_anchors_idx } : null,
  };
}

export type Snap1DRangesDirectionAlignedResult =
  cmath.ext.snap.spacing.DistributionGeometry1D & {
    distance: number;
    a_snap: cmath.ext.snap.Snap1DResult;
    b_snap: cmath.ext.snap.Snap1DResult;
    a_hit_loops_idx: number[];
    b_hit_loops_idx: number[];

    // newly added for using anchor in the guide
    a_flat: Array<cmath.ext.snap.spacing.ProjectionPoint>;
    b_flat: Array<cmath.ext.snap.spacing.ProjectionPoint>;
    a_flat_loops_idx: number[];
    b_flat_loops_idx: number[];
  };

function snap1DRangesDirectionAlignedWithDistributionGeometry(
  agent: cmath.Range,
  anchors: cmath.Range[],
  threshold: number,
  tolerance = 0
): Snap1DRangesDirectionAlignedResult {
  // project the anchor ranges
  const agentLength = cmath.range.length(agent);
  const plots = cmath.ext.snap.spacing.plotDistributionGeometry(
    anchors,
    agentLength
  );

  const { a, b } = plots;

  // Flatten BOTH pos & anchor for 'a'
  const a_flat: Array<cmath.ext.snap.spacing.ProjectionPoint> = [];
  const a_flat_loops_idx: number[] = [];

  a.forEach((loop, loopIdx) => {
    loop.forEach((pair) => {
      a_flat.push(pair);
      a_flat_loops_idx.push(loopIdx);
    });
  });

  // Flatten BOTH pos & anchor for 'b'
  const b_flat: Array<cmath.ext.snap.spacing.ProjectionPoint> = [];
  const b_flat_loops_idx: number[] = [];

  b.forEach((loop, loopIdx) => {
    loop.forEach((pair) => {
      b_flat.push(pair);
      b_flat_loops_idx.push(loopIdx);
    });
  });

  // We only give snap1D the pos dimension
  const a_pos = a_flat.map((a) => a.p);
  const b_pos = b_flat.map((b) => b.p);

  // Perform snapping on each side of the agent's ranges
  const a_snap = cmath.ext.snap.snap1D([agent[0]], a_pos, threshold, tolerance);
  const b_snap = cmath.ext.snap.snap1D([agent[1]], b_pos, threshold, tolerance);

  // get the original loop index from the flattened arrays
  const a_hit_loops_idx = a_snap.hit_anchor_indices.map(
    (idx) => a_flat_loops_idx[idx]
  );
  const b_hit_loops_idx = b_snap.hit_anchor_indices.map(
    (idx) => b_flat_loops_idx[idx]
  );

  return {
    ...plots,
    distance: Math.min(a_snap.distance, b_snap.distance),

    // keep the snap results and helpful context
    a_snap,
    b_snap,
    a_hit_loops_idx,
    b_hit_loops_idx,

    // for usage in spacing‐guide rendering:
    a_flat, // now we can see the [pos, anchor] pairs
    b_flat,
    a_flat_loops_idx,
    b_flat_loops_idx,
  };
}

export namespace guide {
  function __surface_snap_guide_by_guide<TAnchors extends SnapAnchors>(
    snapping: SnapResult<TAnchors>
  ): cmath.ui.Rule[] {
    const { by_guides: by_guide, anchors, delta } = snapping;
    if (!by_guide) return [];
    const rules: cmath.ui.Rule[] = [];

    if (by_guide.x && by_guide.x.distance === delta[0]) {
      by_guide.x.hit_anchor_indices.forEach((idx) => {
        rules.push([
          "x",
          anchors.guides![by_guide.x!.aligned_anchors_idx[idx]].offset,
        ]);
      });
    }
    if (by_guide.y && by_guide.y.distance === delta[1]) {
      by_guide.y.hit_anchor_indices.forEach((idx) => {
        rules.push([
          "y",
          anchors.guides![by_guide.y!.aligned_anchors_idx[idx]].offset,
        ]);
      });
    }

    return rules;
  }

  //
  function __surface_snap_guide_by_objects<TAnchors extends SnapAnchors>(
    context: SnapResult<TAnchors>
  ): {
    lines: cmath.ui.Line[];
    points: cmath.Vector2[];
  } {
    const { by_objects, anchors, delta } = context;
    if (!by_objects) return { lines: [], points: [] };

    const { x, y, translated } = by_objects;

    const lines: cmath.ui.Line[] = [];
    const points: cmath.Vector2[] = [];

    // Separate x-hit and y-hit points
    const xPoints: cmath.Vector2[] = [];
    const yPoints: cmath.Vector2[] = [];

    by_objects.hit_points.anchors.forEach((hit, i) => {
      const anchor9 = cmath.rect.to9PointsChunk(anchors.objects![i]);
      hit.forEach(([xhit, yhit], j) => {
        if (x && xhit) xPoints.push(anchor9[j]);
        if (y && yhit) yPoints.push(anchor9[j]);
        if ((x && xhit) || (y && yhit)) points.push(anchor9[j]);
      });
    });

    const agent9 = cmath.rect.to9PointsChunk(translated);
    by_objects.hit_points.agent.forEach(([xhit, yhit], i) => {
      if (x && xhit) xPoints.push(agent9[i]);
      if (y && yhit) yPoints.push(agent9[i]);
      if ((x && xhit) || (y && yhit)) points.push(agent9[i]);
    });

    // Vertical lines from xPoints
    const xs = new Map<number, number[]>();
    xPoints.forEach(([x, y]) => {
      if (!xs.has(x)) xs.set(x, []);
      xs.get(x)!.push(y);
    });
    xs.forEach((arrY, x) => {
      if (arrY.length > 1) {
        lines.push({
          x1: x,
          y1: Math.min(...arrY),
          x2: x,
          y2: Math.max(...arrY),
        });
      }
    });

    // Horizontal lines from yPoints
    const ys = new Map<number, number[]>();
    yPoints.forEach(([x, y]) => {
      if (!ys.has(y)) ys.set(y, []);
      ys.get(y)!.push(x);
    });
    ys.forEach((arrX, y) => {
      if (arrX.length > 1) {
        lines.push({
          x1: Math.min(...arrX),
          y1: y,
          x2: Math.max(...arrX),
          y2: y,
        });
      }
    });

    return { points, lines };
  }

  function __surface_snap_guide_by_points<TAnchors extends SnapAnchors>(
    context: SnapResult<TAnchors>
  ): {
    lines: cmath.ui.Line[];
    points: cmath.Vector2[];
  } {
    const { by_points, anchors } = context;
    if (!by_points) return { lines: [], points: [] };

    const { x, y, translated, hit_points } = by_points;

    const lines: cmath.ui.Line[] = [];
    const points: cmath.Vector2[] = [];

    const xPoints: cmath.Vector2[] = [];
    const yPoints: cmath.Vector2[] = [];

    hit_points.anchors.forEach(([xhit, yhit], i) => {
      const p = anchors.points![i];
      if (x && xhit) xPoints.push(p);
      if (y && yhit) yPoints.push(p);
      if ((x && xhit) || (y && yhit)) points.push(p);
    });

    translated.forEach((p, i) => {
      const [xhit, yhit] = hit_points.agent[i];
      if (x && xhit) xPoints.push(p);
      if (y && yhit) yPoints.push(p);
      if ((x && xhit) || (y && yhit)) points.push(p);
    });

    const xs = new Map<number, number[]>();
    xPoints.forEach(([x, y]) => {
      if (!xs.has(x)) xs.set(x, []);
      xs.get(x)!.push(y);
    });
    xs.forEach((arrY, x) => {
      if (arrY.length > 1) {
        lines.push({
          x1: x,
          y1: Math.min(...arrY),
          x2: x,
          y2: Math.max(...arrY),
        });
      }
    });

    const ys = new Map<number, number[]>();
    yPoints.forEach(([x, y]) => {
      if (!ys.has(y)) ys.set(y, []);
      ys.get(y)!.push(x);
    });
    ys.forEach((arrX, y) => {
      if (arrX.length > 1) {
        lines.push({
          x1: Math.min(...arrX),
          y1: y,
          x2: Math.max(...arrX),
          y2: y,
        });
      }
    });

    return { lines, points };
  }

  function __calc_spacing_loop_gap_line({
    loop,
    gap,
    axis,
  }: {
    loop: cmath.Rectangle[];
    gap: number;
    axis: cmath.Axis;
  }) {
    const origianl_rect_first = loop[0];
    const origianl_rect_last = loop[loop.length - 1];

    const label = cmath.ui.formatNumber(gap, 1);

    const counterAxis = cmath.counterAxis(axis);

    const loop_gap_counter_axis_pos = cmath.range.mean(
      cmath.range.fromRectangle(origianl_rect_first, counterAxis),
      cmath.range.fromRectangle(origianl_rect_last, counterAxis)
    );
    // r.x + r.width
    const loop_gap_main_axis_a = cmath.range.fromRectangle(
      origianl_rect_first,
      axis
    )[1];
    const loop_gap_main_axis_b = loop_gap_main_axis_a + gap;

    const a = cmath.vector2.axisOriented(
      loop_gap_main_axis_a,
      loop_gap_counter_axis_pos,
      axis
    );

    const b = cmath.vector2.axisOriented(
      loop_gap_main_axis_b,
      loop_gap_counter_axis_pos,
      axis
    );

    return cmath.ui.normalizeLine({
      label: label,
      x1: a[0],
      y1: a[1],
      x2: b[0],
      y2: b[1],
    } satisfies cmath.ui.Line);
  }

  function __calc_spacing_agent_gap_line({
    p,
    axis,
    anchor,
  }: {
    p: cmath.ext.snap.spacing.ProjectionPoint;
    axis: cmath.Axis;
    anchor: cmath.Rectangle;
  }) {
    const lines: cmath.ui.Line[] = [];
    const { p: pos, o: origin } = p;

    // We'll pick a "counterAxis" coordinate (like the mid Y for axis="x", or mid X for axis="y")
    const counterAxis = cmath.counterAxis(axis);
    const anchorRectMid = cmath.range.mean(
      cmath.range.fromRectangle(anchor, counterAxis)
    );

    // Convert anchor -> pos into a 2D line
    // "anchor" is the point from which "pos" was derived,
    // and they are both 1D along `axis`. So we pick anchorRectMid for the other coordinate
    const anchorPt = cmath.vector2.axisOriented(origin, anchorRectMid, axis);
    const posPt = cmath.vector2.axisOriented(pos, anchorRectMid, axis);
    const gap = Math.abs(pos - origin);

    const label = cmath.ui.formatNumber(gap, 1);

    lines.push({
      label: label,
      x1: anchorPt[0],
      y1: anchorPt[1],
      x2: posPt[0],
      y2: posPt[1],
    });

    return lines;
  }

  function __surface_snap_guide_by_objects_spacing<
    TAnchors extends SnapAnchors,
  >(
    context: SnapResult<TAnchors>
  ): {
    lines: cmath.ui.Line[];
  } {
    const { by_objects_spacing: by_spacing, anchors: main_anchors } = context;
    if (!by_spacing) return { lines: [] };

    const { x, y } = by_spacing;
    const lines: cmath.ui.Line[] = [];

    function handle_axis({
      a_flat, // flattened [pos, anchor]
      a_flat_loops_idx, // flattened -> loop index
      a_snap,
      b_flat,
      b_flat_loops_idx,
      b_snap,
      loops,
      gaps,
      aligned_anchors_idx,
      anchors,
      axis,
      distance,
    }: Snap1DRangesDirectionAlignedResult & {
      aligned_anchors_idx: number[];
      anchors: cmath.Rectangle[];
      axis: cmath.Axis;
    }) {
      // If we actually snapped via the "a" side
      if (a_snap.distance === distance) {
        // Each anchor index we actually snapped to
        a_snap.hit_anchor_indices.forEach((hitIdx) => {
          const p = a_flat[hitIdx];
          const { fwd } = p;
          const loop_idx = a_flat_loops_idx[hitIdx];
          const loop = loops[loop_idx];
          const anchor_rect_idx =
            aligned_anchors_idx[
              loop[
                // // fwd === -1 => center extension
                fwd === -1 ? 0 : loop.length - 1
              ]
            ];
          const anchor = anchors[anchor_rect_idx];

          // the main line for the agent.
          lines.push(...__calc_spacing_agent_gap_line({ p, axis, anchor }));

          // lines for uniform gap loops (including self)

          if (fwd !== -1) {
            const loop = loops[fwd];
            const gap = gaps[fwd];
            const rects_loop = loop.map(
              (idx) => anchors[aligned_anchors_idx[idx]]
            );

            lines.push(
              __calc_spacing_loop_gap_line({
                axis,
                loop: rects_loop,
                gap: gap,
              })
            );
          }
        });
      }

      // If we actually snapped via the "b" side
      if (b_snap.distance === distance) {
        // Each anchor index we actually snapped to
        b_snap.hit_anchor_indices.forEach((hitIdx) => {
          const p = b_flat[hitIdx];
          const { fwd } = p;
          const loop_idx = b_flat_loops_idx[hitIdx];
          const loop = loops[loop_idx];
          const anchor_rect_idx =
            aligned_anchors_idx[
              loop[
                // fwd === -1 => center extension
                fwd === -1 ? loop.length - 1 : 0
              ]
            ];
          const anchor = anchors[anchor_rect_idx];

          // the main line for the agent.
          lines.push(...__calc_spacing_agent_gap_line({ p, axis, anchor }));

          // lines for uniform gap loops (including self)

          if (fwd !== -1) {
            const loop = loops[fwd];
            const gap = gaps[fwd];
            const rects_loop = loop.map(
              (idx) => anchors[aligned_anchors_idx[idx]]
            );

            lines.push(
              __calc_spacing_loop_gap_line({
                axis,
                loop: rects_loop,
                gap: gap,
              })
            );
          }
        });
      }
    }

    // Only draw for whichever axis actually caused the snap
    if (x) {
      handle_axis({
        ...x,
        aligned_anchors_idx: x.aligned_anchors_idx,
        anchors: main_anchors.objects!,
        axis: "x",
      });
    }

    if (y) {
      handle_axis({
        ...y,
        aligned_anchors_idx: y.aligned_anchors_idx,
        anchors: main_anchors.objects!,
        axis: "y",
      });
    }

    return {
      lines,
    };
  }

  export type SnapGuide = {
    points: cmath.Vector2[];
    rules: cmath.ui.Rule[];
    lines: cmath.ui.Line[];
  };

  export function plot<TAnchors extends SnapAnchors>(
    snapping: SnapResult<TAnchors>
  ): SnapGuide {
    const lines: cmath.ui.Line[] = [];
    const points: cmath.Vector2[] = [];
    const rules: cmath.ui.Rule[] = [];

    // #region by_objects
    const by_objects = __surface_snap_guide_by_objects(snapping);

    points.push(...by_objects.points);
    lines.push(...by_objects.lines);
    // #endregion by_objects

    // #region by_points
    const by_points = __surface_snap_guide_by_points(snapping);
    points.push(...by_points.points);
    lines.push(...by_points.lines);
    // #endregion by_points

    // #region by_spacing
    const by_spacing = __surface_snap_guide_by_objects_spacing(snapping);
    lines.push(...by_spacing.lines);
    // #endregion by_spacing

    // #region by_guide
    rules.push(...__surface_snap_guide_by_guide(snapping));

    return {
      points,
      rules,
      lines,
    };
  }
}
