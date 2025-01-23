import assert from "assert";
import { cmath } from ".";

export type SnapToObjectsResult = {
  translated: cmath.Rectangle;
  delta: cmath.Vector2;
  points: {
    x: cmath.ext.snap.AxisAlignedPoint[];
    y: cmath.ext.snap.AxisAlignedPoint[];
  };
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
  // const snap_spc = snapToObjectsSpace(agent, anchors, threshold, epsilon);

  // Determine the final delta for each axis
  const x_delta = snap_geo.x.distance;
  const y_delta = snap_geo.y.distance;

  // Apply translation to all points
  const translated_agent_points: cmath.Vector2[] = snap_geo.agent_points.map(
    ([x, y]) => [x + x_delta, y + y_delta]
  );

  const translated_agent = cmath.rect.translate(agent, [x_delta, y_delta]);

  return {
    translated: translated_agent,
    delta: [x_delta, y_delta],
    points: {
      x: [
        ...snap_geo.x.hit_agent_indicies.map((i) => translated_agent_points[i]),
        ...snap_geo.x.hit_anchor_indicies.map((i) => snap_geo.anchor_points[i]),
      ],
      y: [
        ...snap_geo.y.hit_agent_indicies.map((i) => translated_agent_points[i]),
        ...snap_geo.y.hit_anchor_indicies.map((i) => snap_geo.anchor_points[i]),
      ],
    },
  };
}

function snapToObjectsGeometry(
  agent: cmath.Rectangle,
  anchors: cmath.Rectangle[],
  threshold: cmath.Vector2,
  epsilon = 0
): Sanp2DAxisAlignedResult & {
  agent_points: cmath.Vector2[];
  anchor_points: cmath.ext.snap.AxisAlignedPoint[];
} {
  // 1) snap to objects 9 points (each corner (4), center (1), and midpoints (4))
  const agent_points = Object.values(cmath.rect.to9Points(agent));
  const anchor_points: cmath.ext.snap.AxisAlignedPoint[] = anchors
    .map((r) => Object.values(cmath.rect.to9Points(r)))
    .flat();

  const snap = snap2DAxisAligned(
    agent_points,
    anchor_points,
    threshold,
    epsilon
  );

  return {
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
): Sanp2DAxisAlignedResult {
  const [x_threshold, y_threshold] = threshold;

  // #region repeated-space projected points
  const x_range: cmath.Range = [agent.x, agent.x + agent.width];
  const y_range: cmath.Range = [agent.y, agent.y + agent.height];

  // x-aligned uses y range comparison
  const x_aligned_anchors = anchors.filter((a) => {
    const a_y_range: cmath.Range = [a.y, a.y + a.height];
    return cmath.vector2.intersects(y_range, a_y_range);
  });

  const x_aligned_anchor_ranges = x_aligned_anchors.map(
    (r) => [r.x, r.x + r.width] as cmath.Range
  );

  const x_repeated_anchors = cmath.ext.snap.spacing.repeatRangeProjections(
    x_aligned_anchor_ranges
  );

  const x_a_anchors = x_repeated_anchors.a.flat();
  const x_b_anchors = x_repeated_anchors.b.flat();
  // const x_c_anchor_points = x_repeated_anchors.c.flat();

  const a_snap = cmath.ext.snap.snap1D([x_range[0]], x_a_anchors, x_threshold);
  const b_snap = cmath.ext.snap.snap1D([x_range[1]], x_b_anchors, x_threshold);

  return {
    x: a_snap,
    y: b_snap,
  };
}

// export function snap1DRanges(
//   agents: cmath.Range[],
//   anchors: cmath.Range[],
//   threshold: number
// ) {
//   const a_agents = agents.map(([a, _]) => a);
//   const b_agents = agents.map(([_, b]) => b);
//   const c_agents = agents.map(([a, b]) => cmath.mean(a, b));

//   const a_anchors = anchors.map(([a, _]) => a);
//   const b_anchors = anchors.map(([_, b]) => b);
//   const c_anchors = anchors.map(([a, b]) => cmath.mean(a, b));

//   const a_snap = cmath.ext.snap.snap1D(a_agents, a_anchors, threshold);
//   const b_snap = cmath.ext.snap.snap1D(b_agents, b_anchors, threshold);
//   const c_snap = cmath.ext.snap.snap1D(c_agents, c_anchors, threshold);
// }

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
