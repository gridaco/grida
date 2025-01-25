import React, { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair } from "./crosshair";
import { useEventTarget } from "@/grida-react-canvas/provider";
import {
  lineToSurfaceSpace,
  offsetToSurfaceSpace,
  pointToSurfaceSpace,
  vector2ToSurfaceSpace,
} from "@/grida-react-canvas/utils/transform";
import { Rule } from "./rule";
import { cmath } from "@grida/cmath";
import {
  Snap1DRangesDirectionAlignedResult,
  SnapToObjectsResult,
} from "@grida/cmath/_snap";
import { MeterLabel } from "./meter";

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

function __calc_loop_gap_line(
  idx: number,
  context: {
    axis: cmath.Axis;
    loops: number[][];
    gaps: number[];
    aligned_anchors: cmath.Rectangle[];
    aligned_anchors_idx: number[];
  }
) {
  const loop = context.loops[idx];
  const gap = context.gaps[idx];
  const [rai1, rai2] = loop;
  const origianl_rect_1 =
    context.aligned_anchors[context.aligned_anchors_idx[rai1]];
  const origianl_rect_2 =
    context.aligned_anchors[context.aligned_anchors_idx[rai2]];

  const gap_label_str = cmath.ui.formatNumber(gap, 1);

  const axis = context.axis;
  const counterAxis = cmath.counterAxis[axis];

  const loop_gap_counter_axis_pos = cmath.range.mean(
    cmath.range.fromRectangle(origianl_rect_1, counterAxis),
    cmath.range.fromRectangle(origianl_rect_2, counterAxis)
  );
  // r.x + r.width
  const loop_gap_main_axis_a = cmath.range.fromRectangle(
    origianl_rect_1,
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

  return {
    label: gap_label_str,
    x1: a[0],
    y1: a[1],
    x2: b[0],
    y2: b[1],
  } satisfies cmath.ui.Line;
}

function __surface_snap_guide_by_spacing(context: SnapToObjectsResult) {
  const {
    by_spacing,
    translated,
    anchors: main_anchors,
    delta: [deltaX, deltaY],
  } = context;

  const { x_aligned_anchors_idx, y_aligned_anchors_idx, x, y } = by_spacing;

  const lines: cmath.ui.Line[] = [];

  function handle_axis({
    a,
    a_hit_loops_idx,
    a_snap,
    loops,
    gaps,
    aligned_anchors_idx,
    anchors,
    axis,
  }: Snap1DRangesDirectionAlignedResult & {
    aligned_anchors_idx: number[];
    anchors: cmath.Rectangle[];
    axis: cmath.Axis;
  }) {
    a_hit_loops_idx.forEach((loop_idx, i) => {
      const a_hit_loop = loops[loop_idx];
      // console.log("a_hit_loop", loops, loop_idx, a_hit_loop);
      const ri_first = a_hit_loop[0];
      const ri_last = a_hit_loop[a_hit_loop.length - 1];
      const gap = gaps[loop_idx]; // TODO: don't use this
      // const a_points = a[loop_idx];
      // const a_hits = a_snap.hit_anchor_indices.map((i) => a_points[i]);
      // const hitgaps = a_hits.map(([_, gap]) => gap);
      // console.log("a_hits", a_hits, hitgaps);

      // query loops with same gap.
      const surface_epsilon = 0.01;
      const uniform_gap_loops_idx = gaps.reduce((acc, testgap, i) => {
        if (Math.abs(testgap - gap) < surface_epsilon) acc.push(i);
        return acc;
      }, [] as number[]);

      // Map loop index to original anchor index
      const original_anchor_rect_first_idx = aligned_anchors_idx[ri_first];
      const original_anchor_rect_last_idx = aligned_anchors_idx[ri_last];
      // const origianl_rect_first = anchors[original_anchor_rect_first_idx];
      const origianl_rect_last = anchors[original_anchor_rect_last_idx];

      const counterAxis = cmath.counterAxis[axis];
      // [counter axis] r.x(y) + r.width(height) / 2;
      const agent_gap_counter_axis_pos = cmath.range.mean(
        cmath.range.fromRectangle(origianl_rect_last, counterAxis)
      );
      // [main axis] r.x(y) + r.width(height)
      const agent_gap_main_axis_a = cmath.range.fromRectangle(
        origianl_rect_last,
        axis
      )[1];
      const agent_gap_main_axis_b = agent_gap_main_axis_a + gap;

      const gap_label_str = cmath.ui.formatNumber(gap, 1);

      const _1 = cmath.vector2.axisOriented(
        agent_gap_main_axis_a,
        agent_gap_counter_axis_pos,
        axis
      );
      const _2 = cmath.vector2.axisOriented(
        agent_gap_main_axis_b,
        agent_gap_counter_axis_pos,
        axis
      );
      lines.push({
        label: gap_label_str,
        x1: _1[0],
        y1: _1[1],
        x2: _2[0],
        y2: _2[1],
      });
      //

      const uniform_loop_gap_lines = uniform_gap_loops_idx
        .map((loop_idx) => {
          return __calc_loop_gap_line(loop_idx, {
            axis: axis,
            loops: loops,
            gaps: gaps,
            aligned_anchors: anchors,
            aligned_anchors_idx: aligned_anchors_idx,
          });
        })
        .filter((l) => l) as cmath.ui.Line[];

      lines.push(...uniform_loop_gap_lines);
    });
  }

  if (deltaX === x.distance) {
    handle_axis({
      ...x,
      aligned_anchors_idx: x_aligned_anchors_idx,
      anchors: main_anchors,
      axis: "x",
    });
  }

  if (deltaY === y.distance) {
    handle_axis({
      ...y,
      aligned_anchors_idx: y_aligned_anchors_idx,
      anchors: main_anchors,
      axis: "y",
    });
  }

  return {
    lines,
  };
  //
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
  // x_points: cmath.Vector2[];
  // x_offsets: number[];
  // y_points: cmath.Vector2[];
  // y_offsets: number[];
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

function Line({ x1, y1, x2, y2, label }: cmath.ui.Line) {
  const angle = cmath.vector2.angle([x1, y1], [x2, y2]);
  const side = angle === 0 ? "bottom" : angle === 90 ? "right" : "right";
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const offset = 16;
  // offset the text box by angle 0 and 90
  const offX = angle === 90 ? offset : 0;
  const offY = angle === 0 ? offset : 0;

  return (
    <>
      <svg
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          cursor: "none",
          willChange: "transform",
          zIndex: 10,
        }}
        className="stroke-workbench-accent-red text-workbench-accent-red"
      >
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="currentColor"
          strokeWidth={0.5}
        />
      </svg>
      {label && (
        <MeterLabel
          className="bg-workbench-accent-red text-white"
          side={side}
          sideOffset={16}
          label={label}
          x={midX}
          y={midY}
        />
        // <div

        //   style={{
        //     position: "absolute",
        //     left: midX + offX,
        //     top: midY + offY,
        //     transform: "translate(-50%, -50%)",
        //     padding: "2px 4px",
        //     fontSize: 10,
        //     borderRadius: 4,
        //     pointerEvents: "none",
        //   }}
        // >
        //   {label}
        // </div>
      )}
    </>
  );
}
