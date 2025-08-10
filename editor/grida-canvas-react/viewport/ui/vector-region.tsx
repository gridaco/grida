import React, { useMemo, useState } from "react";
import { useGesture } from "@use-gesture/react";
import cmath from "@grida/cmath";
import { svg } from "@/grida-canvas-utils/svg";
import { SVGPathData, SVGCommand } from "svg-pathdata";
import { DiagonalStripe } from "./svg-fill-patterns";
import useSurfaceVectorEditor from "@/grida-canvas-react/use-sub-vector-network-editor";

interface RegionSegment {
  /**
   * index of the segment in the vector network
   */
  idx: number;
  /**
   * index of vertex a within the provided vertices array
   */
  a: number;
  /**
   * index of vertex b within the provided vertices array
   */
  b: number;
  ta: cmath.Vector2;
  tb: cmath.Vector2;
}

export function VectorRegion({
  vertices,
  segments,
  disabled = false,
}: {
  vertices: cmath.Vector2[];
  segments: RegionSegment[];
  disabled?: boolean;
}) {
  const ve = useSurfaceVectorEditor();
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);

  const path = useMemo(() => {
    if (segments.length === 0) return "";
    const offset = vertices[0];
    const commands: SVGCommand[] = [];
    segments.forEach((s, i) => {
      const a = cmath.vector2.sub(vertices[s.a], offset);
      const b = cmath.vector2.sub(vertices[s.b], offset);
      const seg = svg.d.curve(a, s.ta, s.tb, b);
      if (i !== 0) seg.shift();
      commands.push(...seg);
    });
    commands.push({ type: SVGPathData.CLOSE_PATH });
    return svg.d.encode(commands);
  }, [segments, vertices]);

  const bind = useGesture(
    {
      onHover: (s) => {
        if (s.first) setHovered(true);
        if (s.last) setHovered(false);
      },
      onPointerDown: ({ event }) => {
        event.preventDefault();
        setActive(true);
        if (segments.length > 0) {
          ve.selectSegment(segments[0].idx, false);
          for (let i = 1; i < segments.length; i++) {
            ve.selectSegment(segments[i].idx, true);
          }
        }
      },
      onDragStart: ({ event }) => {
        event.preventDefault();
        ve.onDragStart();
      },
      onDragEnd: () => {
        setActive(false);
      },
      onPointerUp: () => {
        setActive(false);
      },
    },
    { drag: { threshold: 1 }, enabled: !disabled }
  );

  const offset = vertices[0];

  return (
    <svg
      {...bind()}
      style={{
        position: "absolute",
        left: offset[0],
        top: offset[1],
        width: 1,
        height: 1,
        overflow: "visible",
        cursor: active ? "grabbing" : "grab",
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <DiagonalStripe />
      <path
        d={path}
        fill={
          disabled
            ? "transparent"
            : hovered
              ? "url(#diagonalStripes)"
              : "transparent"
        }
        stroke="transparent"
      />
    </svg>
  );
}

export default VectorRegion;
