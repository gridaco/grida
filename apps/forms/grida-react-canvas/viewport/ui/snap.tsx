import React, { useEffect, useRef, useState } from "react";
import { Crosshair } from "./crosshair";
import { useDocument } from "@/grida-react-canvas/provider";
import {
  offsetToSurfaceSpace,
  pointToSurfaceSpace,
} from "@/grida-react-canvas/utils/transform";
import { surface } from "./types";
import { Rule } from "./rule";
import { cmath } from "@grida/cmath";
import {
  Snap1DRangesDirectionAlignedResult,
  SnapToObjectsResult,
} from "@grida/cmath/_snap";

function __surface_snap_guide_by_geometry(context: SnapToObjectsResult) {
  const { by_geometry, translated, anchors } = context;

  const points: cmath.Vector2[] = [];
  const x_ray_offsets: number[] = [];
  const y_ray_offsets: number[] = [];

  by_geometry.hit_points.anchors.map((a, i) => {
    const _anchor9 = cmath.rect.to9PointsChunk(anchors[i]);

    a.forEach(([xhit, yhit], j) => {
      const p = _anchor9[j];
      if (xhit || yhit) points.push(p);
      if (xhit) x_ray_offsets.push(p[0]);
      if (yhit) y_ray_offsets.push(p[1]);
    });
  });

  const _agent9 = cmath.rect.to9PointsChunk(translated);
  by_geometry.hit_points.agent.forEach(([xhit, yhit], i) => {
    const p = _agent9[i];
    if (xhit || yhit) points.push(p);
    if (xhit) x_ray_offsets.push(p[0]);
    if (yhit) y_ray_offsets.push(p[1]);
  });

  return {
    points,
    x_ray_offsets,
    y_ray_offsets,
  };
}

function __surface_snap_guide_by_spacing(context: SnapToObjectsResult) {
  const {
    by_spacing,
    translated,
    anchors: main_anchors,
    delta: [deltaX, deltaY],
  } = context;

  function calc_loop_gap_line(
    idx: number,
    context: {
      axis: "x" | "y";
      loops: [number, number][];
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

    const gap_label_str = cmath.debug.formatNumber(gap, 1);

    //

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

    if (context.axis === "x") {
      return {
        label: gap_label_str,
        a: [loop_gap_main_axis_a, loop_gap_counter_axis_pos],
        b: [loop_gap_main_axis_b, loop_gap_counter_axis_pos],
      } satisfies surface.Line;
    } else {
      return {
        label: gap_label_str,
        a: [loop_gap_counter_axis_pos, loop_gap_main_axis_a],
        b: [loop_gap_counter_axis_pos, loop_gap_main_axis_b],
      } satisfies surface.Line;
    }
  }

  const { x_aligned_anchors_idx, y_aligned_anchors_idx, x, y } = by_spacing;

  const x_anchors = x_aligned_anchors_idx.map((i) => main_anchors[i]);
  const y_anchors = y_aligned_anchors_idx.map((i) => main_anchors[i]);

  const lines: surface.Line[] = [];

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
      const [ri1, ri2] = a_hit_loop; // index of range
      const gap = gaps[loop_idx];

      // query loops with same gap.
      const surface_epsilon = 0.01;
      const uniform_gap_loops_idx = gaps.reduce((acc, gap, i) => {
        if (Math.abs(gap - gaps[loop_idx]) < surface_epsilon) acc.push(i);
        return acc;
      }, [] as number[]);

      // const r1 = x_aligned_anchor_ranges[ri1];
      // const r2 = x_aligned_anchor_ranges[ri2];
      // Map loop index to original anchor index
      const original_anchor_rect_1_idx = aligned_anchors_idx[ri1];
      const original_anchor_rect_2_idx = aligned_anchors_idx[ri2];
      const origianl_rect_1 = anchors[original_anchor_rect_1_idx];
      const origianl_rect_2 = anchors[original_anchor_rect_2_idx];

      const counterAxis = cmath.counterAxis[axis];
      // [counter axis] r.x(y) + r.width(height) / 2;
      const agent_gap_counter_axis_pos = cmath.range.mean(
        cmath.range.fromRectangle(origianl_rect_2, counterAxis)
      );
      // [main axis] r.x(y) + r.width(height)
      const agent_gap_main_axis_a = cmath.range.fromRectangle(
        origianl_rect_2,
        axis
      )[1];
      const agent_gap_main_axis_b = agent_gap_main_axis_a + gap;

      const gap_label_str = cmath.debug.formatNumber(gap, 1);

      if (axis === "x") {
        lines.push({
          label: gap_label_str,
          a: [agent_gap_main_axis_a, agent_gap_counter_axis_pos],
          b: [agent_gap_main_axis_b, agent_gap_counter_axis_pos],
        });
      } else {
        lines.push({
          label: gap_label_str,
          a: [agent_gap_counter_axis_pos, agent_gap_main_axis_a],
          b: [agent_gap_counter_axis_pos, agent_gap_main_axis_b],
        });
      }
      //

      const uniform_loop_gap_lines = uniform_gap_loops_idx
        .map((loop_idx) => {
          return calc_loop_gap_line(loop_idx, {
            axis: axis,
            loops: loops,
            gaps: gaps,
            // TODO:
            aligned_anchors: anchors,
            aligned_anchors_idx: aligned_anchors_idx,
          });
        })
        .filter((l) => l) as surface.Line[];

      lines.push(...uniform_loop_gap_lines);
    });
  }

  if (deltaX === x.distance) {
    handle_axis({
      ...x,
      aligned_anchors_idx: x_aligned_anchors_idx,
      anchors: x_anchors,
      axis: "x",
    });
  }

  if (deltaY === y.distance) {
    handle_axis({
      ...y,
      aligned_anchors_idx: y_aligned_anchors_idx,
      anchors: y_anchors,
      axis: "y",
    });
  }

  return {
    lines,
  };
  //
}

function useSnapGuide(): surface.SnapGuide | undefined {
  const { state, transform } = useDocument();
  const { gesture } = state;

  if (
    (gesture.type === "translate" ||
      gesture.type === "nudge" ||
      gesture.type === "scale") &&
    gesture.surface_snapping
  ) {
    const lines: surface.Line[] = [];
    const points: cmath.Vector2[] = [];
    const x_ray_offsets: number[] = [];
    const y_ray_offsets: number[] = [];

    // #region by_geometry
    const by_geometry = __surface_snap_guide_by_geometry(
      gesture.surface_snapping
    );

    points.push(...by_geometry.points);
    x_ray_offsets.push(...by_geometry.x_ray_offsets);
    y_ray_offsets.push(...by_geometry.y_ray_offsets);
    // #endregion by_geometry

    // #region by_spacing
    const by_spacing = __surface_snap_guide_by_spacing(
      gesture.surface_snapping
    );
    lines.push(...by_spacing.lines);
    // #endregion by_spacing

    const rays: surface.Ray[] = [
      ...Array.from(new Set(x_ray_offsets)).map(
        (offset) => ["x", offset] satisfies surface.Ray
      ),
      ...Array.from(new Set(y_ray_offsets)).map(
        (offset) => ["y", offset] satisfies surface.Ray
      ),
    ];

    // finally, map the vectors to the surface space
    return {
      lines: lines.map(
        (l) =>
          ({
            ...l,
            a: pointToSurfaceSpace(l.a, transform),
            b: pointToSurfaceSpace(l.b, transform),
          }) satisfies surface.Line
      ),
      points: points.map((p) => pointToSurfaceSpace(p, transform)),
      rays: rays.map((r) => {
        const axis = r[0];
        return [axis, offsetToSurfaceSpace(r[1], axis, transform)];
      }),
    };
  }
}

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

function Line({ a, b, label }: surface.Line) {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const angle = cmath.vector2.angle(a, b);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const textRef = useRef<SVGTextElement>(null);
  const [textDimensions, setTextDimensions] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  useEffect(() => {
    if (textRef.current) {
      const bbox = textRef.current.getBBox();
      setTextDimensions({ width: bbox.width, height: bbox.height });
    }
  }, [label]);

  // Padding (adjust these values as needed)
  const paddingX = 4;
  const paddingY = 2;

  const rectWidth = textDimensions.width + paddingX * 2;
  const rectHeight = textDimensions.height + paddingY * 2;

  const offset = 4;
  // offset the text box by angle 0 and 90
  const offX = angle === 90 ? rectWidth / 2 + offset : 0;
  const offY = angle === 0 ? rectHeight / 2 + offset : 0;

  return (
    <svg
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        cursor: "none",
        willChange: "transform",
        zIndex: 99,
      }}
      className="text-red-500"
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="currentColor"
        strokeWidth={0.5}
      />

      {label && (
        <g>
          {/* Background box */}
          <rect
            x={midX - rectWidth / 2 + offX}
            y={midY - rectHeight / 2 + offY}
            width={rectWidth}
            height={rectHeight}
            fill="currentColor"
            rx={4} // Rounded corners
          />
          {/* Text */}
          <text
            ref={textRef}
            x={midX + offX}
            y={midY + 1 + offY}
            fill="white"
            fontSize="10"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {label}
          </text>
        </g>
      )}
    </svg>
  );
}
