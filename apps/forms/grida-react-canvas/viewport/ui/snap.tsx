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
import { SnapToObjectsResult } from "@grida/cmath/_snap";

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

  const { x_aligned_anchors_idx, y_aligned_anchors_idx, x, y } = by_spacing;

  const x_anchors = x_aligned_anchors_idx.map((i) => main_anchors[i]);
  const y_anchors = y_aligned_anchors_idx.map((i) => main_anchors[i]);

  const lines: surface.Line[] = [];

  if (deltaX === x.distance) {
    x.a_hit_loops_idx.forEach((loop_idx, i) => {
      const a_hit_loop = x.loops[loop_idx];
      const [ri1, ri2] = a_hit_loop; // index of range
      const gap = x.gaps[loop_idx];
      // const r1 = x_aligned_anchor_ranges[ri1];
      // const r2 = x_aligned_anchor_ranges[ri2];
      // Map loop index to original anchor index
      const original_anchor_rect_1_idx = x_aligned_anchors_idx[ri1];
      const original_anchor_rect_2_idx = x_aligned_anchors_idx[ri2];
      const origianl_rect_1 = x_anchors[original_anchor_rect_1_idx];
      const origianl_rect_2 = x_anchors[original_anchor_rect_2_idx];

      const agent_gap_y_pos = origianl_rect_2.y + origianl_rect_2.height / 2;
      const agent_gap_x_a = origianl_rect_2.x + origianl_rect_2.width;
      const agent_gap_x_b = agent_gap_x_a + gap;

      const gap_label_str = cmath.debug.formatNumber(gap, 1);

      const agent_gap_line: surface.Line = {
        label: gap_label_str,
        a: [agent_gap_x_a, agent_gap_y_pos],
        b: [agent_gap_x_b, agent_gap_y_pos],
      };

      lines.push(agent_gap_line);

      const loop_gap_y_pos = cmath.mean(
        origianl_rect_1.y,
        origianl_rect_1.y + origianl_rect_1.height,
        origianl_rect_2.y,
        origianl_rect_2.y + origianl_rect_2.height
      );

      const loop_gap_x_a = origianl_rect_1.x + origianl_rect_1.width;
      const loop_gap_x_b = loop_gap_x_a + gap;

      const loop_gap_line: surface.Line = {
        label: gap_label_str,
        a: [loop_gap_x_a, loop_gap_y_pos],
        b: [loop_gap_x_b, loop_gap_y_pos],
      };

      lines.push(loop_gap_line);
      // console.log("gap line", agent_gap_line);
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

function Line({ a: [x1, y1], b: [x2, y2], label }: surface.Line) {
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
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="darkorange"
        strokeWidth={1}
      />

      {label && (
        <g>
          {/* Background box */}
          <rect
            x={midX - rectWidth / 2}
            y={midY - rectHeight / 2}
            width={rectWidth}
            height={rectHeight}
            fill="darkorange"
            rx={4} // Rounded corners
          />
          {/* Text */}
          <text
            ref={textRef}
            x={midX}
            y={midY + 1}
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
