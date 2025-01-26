import React, { useMemo } from "react";
import { Crosshair } from "./crosshair";
import { useEventTarget } from "@/grida-react-canvas/provider";
import {
  lineToSurfaceSpace,
  offsetToSurfaceSpace,
  vector2ToSurfaceSpace,
} from "@/grida-react-canvas/utils/transform";
import { Rule } from "./rule";
import { cmath } from "@grida/cmath";
import {
  Snap1DRangesDirectionAlignedResult,
  SnapToObjectsResult,
} from "@grida/cmath/_snap";
import { MeterLabel } from "./meter";
import { Line } from "./line";

function __surface_snap_guide_by_geometry(context: SnapToObjectsResult) {
  const { by_geometry, translated, anchors, delta } = context;

  const lines: cmath.ui.Line[] = [];
  const points: cmath.Vector2[] = [];

  // Separate x-hit and y-hit points
  const xPoints: cmath.Vector2[] = [];
  const yPoints: cmath.Vector2[] = [];

  by_geometry.hit_points.anchors.forEach((hit, i) => {
    const anchor9 = cmath.rect.to9PointsChunk(anchors[i]);
    hit.forEach(([xhit, yhit], j) => {
      if (xhit) xPoints.push(anchor9[j]);
      if (yhit) yPoints.push(anchor9[j]);
      if (xhit || yhit) points.push(anchor9[j]);
    });
  });

  const agent9 = cmath.rect.to9PointsChunk(translated);
  by_geometry.hit_points.agent.forEach(([xhit, yhit], i) => {
    if (xhit) xPoints.push(agent9[i]);
    if (yhit) yPoints.push(agent9[i]);
    if (xhit || yhit) points.push(agent9[i]);
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

function __calc_loop_gap_line({
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

  const counterAxis = cmath.counterAxis[axis];

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

function __calc_agent_gap_line({
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
  const counterAxis = cmath.counterAxis[axis];
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

function __surface_snap_guide_by_spacing(context: SnapToObjectsResult) {
  const { by_spacing, anchors: main_anchors } = context;

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
        const loop_idx = a_flat_loops_idx[hitIdx];
        const loop = loops[loop_idx];
        const anchor_rect_idx = aligned_anchors_idx[loop[loop.length - 1]];
        const anchor = anchors[anchor_rect_idx];

        // the main line for the agent.
        lines.push(...__calc_agent_gap_line({ p, axis, anchor }));

        // lines for uniform gap loops (including self)
        const { fwd } = p;
        if (fwd !== -1) {
          const loop = loops[fwd];
          const gap = gaps[fwd];
          const loop_rect = loop.map(
            (idx) => anchors[aligned_anchors_idx[idx]]
          );

          lines.push(
            __calc_loop_gap_line({
              axis,
              loop: loop_rect,
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
        const loop_idx = b_flat_loops_idx[hitIdx];
        const loop = loops[loop_idx];
        const anchor_rect_idx = aligned_anchors_idx[loop[0]];
        const anchor = anchors[anchor_rect_idx];

        // the main line for the agent.
        lines.push(...__calc_agent_gap_line({ p, axis, anchor }));

        // lines for uniform gap loops (including self)
        const { fwd } = p;
        if (fwd !== -1) {
          const loop = loops[fwd];
          const gap = gaps[fwd];
          const loop_rect = loop.map(
            (idx) => anchors[aligned_anchors_idx[idx]]
          );

          lines.push(
            __calc_loop_gap_line({
              axis,
              loop: loop_rect,
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
      anchors: main_anchors,
      axis: "x",
    });
  }

  if (y) {
    handle_axis({
      ...y,
      aligned_anchors_idx: y.aligned_anchors_idx,
      anchors: main_anchors,
      axis: "y",
    });
  }

  return {
    lines,
  };
}

function guide(
  snapping: SnapToObjectsResult,
  transform: cmath.Transform
): SnapGuide {
  const lines: cmath.ui.Line[] = [];
  const points: cmath.Vector2[] = [];
  const x_ray_offsets: number[] = [];
  const y_ray_offsets: number[] = [];

  // #region by_geometry
  const by_geometry = __surface_snap_guide_by_geometry(snapping);

  points.push(...by_geometry.points);
  lines.push(...by_geometry.lines);
  // #endregion by_geometry

  // #region by_spacing
  const by_spacing = __surface_snap_guide_by_spacing(snapping);
  lines.push(...by_spacing.lines);
  // #endregion by_spacing

  const rays: cmath.ui.Rule[] = [
    ...Array.from(new Set(x_ray_offsets)).map(
      (offset) => ["x", offset] satisfies cmath.ui.Rule
    ),
    ...Array.from(new Set(y_ray_offsets)).map(
      (offset) => ["y", offset] satisfies cmath.ui.Rule
    ),
  ];

  // finally, map the vectors to the surface space
  return {
    lines: lines.map((l) => lineToSurfaceSpace(l, transform)),
    points: points.map((p) => vector2ToSurfaceSpace(p, transform)),
    rays: rays.map((r) => {
      const axis = r[0];
      return [axis, offsetToSurfaceSpace(r[1], axis, transform)];
    }),
  };
}

function useSnapGuide(): SnapGuide | undefined {
  const { gesture, transform, surface_snapping } = useEventTarget();

  return useMemo(() => {
    if (
      (gesture.type === "translate" ||
        gesture.type === "nudge" ||
        gesture.type === "scale") &&
      surface_snapping
    ) {
      return guide(surface_snapping, transform);
    }
  }, [gesture, transform, surface_snapping]);
}

type SnapGuide = {
  points: cmath.Vector2[];
  rays: cmath.ui.Rule[];
  lines: cmath.ui.Line[];
};

export function SnapGuide() {
  const guide = useSnapGuide();

  if (!guide) return <></>;

  return (
    <div>
      {guide.lines.map((l, i) => (
        <Line key={i} {...l} />
      ))}
      {guide.rays.map(([axis, offset], i) => (
        <Rule key={i} axis={cmath.counterAxis[axis]} offset={offset} />
      ))}
      {guide.points.map((p, i) => {
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: p[0],
              top: p[1],
              transform: "translate(-50%, -50%)",
              willChange: "transform",
            }}
          >
            <Crosshair />
          </div>
        );
      })}
    </div>
  );
}
