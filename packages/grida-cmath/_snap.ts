import assert from "assert";
import { cmath } from ".";

export type SnapToObjectsResult = {
  /**
   * The translated rectangle after snapping.
   *
   * Returns the original agent when not snapped (delta 0)
   */
  translated: cmath.Rectangle;
  /**
   * The original anchors that were used as references for snapping.
   */
  anchors: cmath.Rectangle[];

  /**
   * The calculated delta for snapping
   */
  delta: cmath.Vector2;

  by_geometry: {
    hit_points: {
      agent: ObjectGeometryHitResult;
      anchors: ObjectGeometryHitResult[];
    };
  };
  by_spacing: {
    x_aligned_anchors_idx: number[];
    y_aligned_anchors_idx: number[];
    x: Snap1DRangesDirectionAlignedResult;
    y: Snap1DRangesDirectionAlignedResult;
  };
  by_ruler: {};
};

export function snapToObjects(
  agent: cmath.Rectangle,
  anchors: cmath.Rectangle[],
  threshold: cmath.Vector2,
  epsilon = 0
): SnapToObjectsResult {
  assert(agent, "Agent must be a valid rectangle.");
  assert(anchors.length > 0, "Anchors must contain at least one rectangle.");

  const snap_geo = snapToObjectsGeometry(agent, anchors, threshold, epsilon);
  const snap_spc = snapToObjectsSpace(agent, anchors, threshold, epsilon);
  const x = bestAxisAlignedDistance(snap_geo.x, snap_spc.x);
  const y = bestAxisAlignedDistance(snap_geo.y, snap_spc.y);

  // Determine the final delta for each axis
  const x_delta = x.distance;
  const y_delta = y.distance;

  const translated_agent = cmath.rect.translate(agent, [x_delta, y_delta]);

  return {
    translated: translated_agent,
    anchors,
    by_geometry: {
      hit_points: {
        agent: snap_geo.agent_hits,
        anchors: snap_geo.anchor_hits,
      },
    },
    by_spacing: snap_spc,
    by_ruler: {},
    delta: [x_delta, y_delta],
  };
}

interface IDistance {
  distance: number;
}

function bestAxisAlignedDistance(...results: IDistance[]): IDistance {
  let min_distance = Infinity;
  let min_index = -1;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.distance === 0) {
      continue;
    } else if (result.distance < min_distance) {
      min_distance = result.distance;
      min_index = i;
    } else if (result.distance === min_distance) {
      // TODO: support multiple results, merge them if the distance is the same (or within epsilon)
    }
  }

  if (min_index === -1) {
    return results[0];
  }

  return results[min_index];
}

type ObjectGeometryHitResult = cmath.rect.TRectangle9PointsChunk<
  [boolean, boolean]
>;

function snapToObjectsGeometry(
  agent: cmath.Rectangle,
  anchors: cmath.Rectangle[],
  threshold: cmath.Vector2,
  epsilon = 0
): Sanp2DAxisAlignedResult & {
  agent_hits: ObjectGeometryHitResult;
  anchor_hits: ObjectGeometryHitResult[];
  agent_points: cmath.Vector2[];
  anchor_points: cmath.ext.snap.AxisAlignedPoint[];
} {
  const geometry_chunk_size = 9;
  // 1) snap to objects 9 points (each corner (4), center (1), and midpoints (4))
  const agent_points = cmath.rect.to9PointsChunk(agent);
  const anchor_points: cmath.ext.snap.AxisAlignedPoint[] = anchors
    .map((r) => cmath.rect.to9PointsChunk(r))
    .flat();

  const snap = snap2DAxisAligned(
    agent_points,
    anchor_points,
    threshold,
    epsilon
  );

  const agent_hits: ObjectGeometryHitResult = agent_points.map(
    (point, index) => {
      const xHit = snap.x.hit_agent_indices.includes(index);
      const yHit = snap.y.hit_agent_indices.includes(index);
      return [xHit, yHit] satisfies [boolean, boolean];
    }
  ) as ObjectGeometryHitResult;

  const anchor_hits: ObjectGeometryHitResult[] = [];
  for (let i = 0; i < anchor_points.length; i += geometry_chunk_size) {
    const chunk = anchor_points.slice(i, i + geometry_chunk_size);
    const hitResult = chunk.map((point, index) => {
      const pointIndex = i + index;
      const xHit = snap.x.hit_anchor_indices.includes(pointIndex);
      const yHit = snap.y.hit_anchor_indices.includes(pointIndex);
      return [xHit, yHit];
    });
    anchor_hits.push(hitResult as ObjectGeometryHitResult);
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

function snapToObjectsSpace(
  agent: cmath.Rectangle,
  anchors: cmath.Rectangle[],
  threshold: cmath.Vector2,
  epsilon = 0
) {
  // Define the agent's ranges on both axes
  const x_range: cmath.Range = [agent.x, agent.x + agent.width];
  const y_range: cmath.Range = [agent.y, agent.y + agent.height];

  // Filter anchors that overlap with the agent's ranges
  // store them as a index so we can locate the original anchor (rectangle) later
  const x_aligned_anchors_idx = anchors.reduce((acc, a, index) => {
    const a_y_range: cmath.Range = [a.y, a.y + a.height];
    if (cmath.vector2.intersects(y_range, a_y_range)) acc.push(index);
    return acc;
  }, [] as number[]);

  const y_aligned_anchors_idx = anchors.reduce((acc, a, index) => {
    const a_x_range: cmath.Range = [a.x, a.x + a.width];
    if (cmath.vector2.intersects(x_range, a_x_range)) acc.push(index);
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

  const x = snap1DRangesDirectionAlignedWithProjection(
    x_range,
    x_aligned_anchor_ranges,
    threshold[0],
    epsilon
  );

  const y = snap1DRangesDirectionAlignedWithProjection(
    y_range,
    y_aligned_anchor_ranges,
    threshold[1],
    epsilon
  );

  return {
    x_aligned_anchors_idx,
    y_aligned_anchors_idx,
    x,
    y,
  };
}

export type Snap1DRangesDirectionAlignedResult =
  cmath.ext.snap.spacing.RangeLoopProjections & {
    distance: number;
    a_snap: cmath.ext.snap.Snap1DResult;
    b_snap: cmath.ext.snap.Snap1DResult;
    a_hit_loops_idx: number[];
    b_hit_loops_idx: number[];
  };

function snap1DRangesDirectionAlignedWithProjection(
  agent: cmath.Range,
  anchors: cmath.Range[],
  threshold: number,
  epsilon = 0
): Snap1DRangesDirectionAlignedResult {
  // project the anchor ranges
  const projection = cmath.ext.snap.spacing.plotAB(agent, anchors);

  const { a, b, loops, gaps } = projection;

  // anchors
  const a_flat: number[] = [];
  const a_flat_loop_idx: number[] = [];
  const b_flat: number[] = [];
  const b_flat_loop_idx: number[] = [];

  a.forEach((loop, i) => {
    loop.forEach((value, j) => {
      a_flat.push(value);
      a_flat_loop_idx.push(i);
    });
  });

  b.forEach((loop, i) => {
    loop.forEach((value, j) => {
      b_flat.push(value);
      b_flat_loop_idx.push(i);
    });
  });

  // Perform snapping on each side of the agent's ranges
  const a_snap = cmath.ext.snap.snap1D([agent[0]], a_flat, threshold, epsilon);

  const b_snap = cmath.ext.snap.snap1D([agent[1]], b_flat, threshold, epsilon);

  // get the origianl loop index based on anchors index.
  const a_hit_loops_idx = a_snap.hit_anchor_indices.map(
    (index) => a_flat_loop_idx[index]
  );

  const b_hit_loops_idx = b_snap.hit_anchor_indices.map(
    (index) => b_flat_loop_idx[index]
  );

  return {
    distance: Math.min(a_snap.distance, b_snap.distance),
    loops,
    gaps,
    a,
    b,
    a_snap,
    b_snap,
    a_hit_loops_idx,
    b_hit_loops_idx,
  };
}

type Sanp2DAxisAlignedResult = {
  x: cmath.ext.snap.Snap1DResult;
  y: cmath.ext.snap.Snap1DResult;
};

/**
 * Snaps an array of points to the nearest target point along each axis independently.
 * The snapping delta is computed for each axis separately and applied to all points.
 *
 * @param agents - An array of 2D points (Vector2) to snap.
 * @param anchors - An array of existing 2D points to snap to.
 * @param threshold - The maximum allowed single-axis distance for snapping.
 * @returns The snapped points and the delta applied:
 *          - `value`: The translated points.
 *          - `distance`: The delta vector applied to align the points.
 */
export function snap2DAxisAligned(
  agents: cmath.Vector2[],
  anchors: cmath.ext.snap.AxisAlignedPoint[],
  threshold: cmath.Vector2,
  epsilon = 0
): Sanp2DAxisAlignedResult {
  assert(agents.length > 0, "Agents must contain at least one point.");
  assert(anchors.length > 0, "Anchors must contain at least one point.");
  assert(threshold[0] >= 0, "Threshold must be a non-negative number.");
  assert(threshold[1] >= 0, "Threshold must be a non-negative number.");

  // Separate the scalar points for each axis
  const x_agent_points = agents.map(([x]) => x);
  const y_agent_points = agents.map(([_, y]) => y);

  // Separate anchor points into x and y components
  const x_anchor_points = anchors
    .map(([x]) => x)
    .filter((x): x is number => x !== null);
  const y_anchor_points = anchors
    .map(([_, y]) => y)
    .filter((y): y is number => y !== null);

  // snap each axis
  const x_snap = cmath.ext.snap.snap1D(
    x_agent_points,
    x_anchor_points,
    threshold[0],
    epsilon
  );

  const y_snap = cmath.ext.snap.snap1D(
    y_agent_points,
    y_anchor_points,
    threshold[1],
    epsilon
  );

  return {
    x: x_snap,
    y: y_snap,
  };
}
