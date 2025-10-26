import React, { useMemo, useState } from "react";
import { useGesture } from "@use-gesture/react";
import cmath from "@grida/cmath";
import { svg } from "@/grida-canvas-utils/svg";
import { SVGPathData, SVGCommand } from "svg-pathdata";
import { SVGPatternDiagonalStripe } from "./svg-fill-patterns";
import type { VectorContentEditor } from "@/grida-canvas-react/use-sub-vector-network-editor";

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
  ve,
  onSelect,
}: {
  vertices: cmath.Vector2[];
  segments: RegionSegment[];
  disabled?: boolean;
  ve: VectorContentEditor;
  onSelect: () => void;
}) {
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
        onSelect();
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
      <SVGPatternDiagonalStripe
        id="vector-region-diagonal-stripes"
        color="var(--color-workbench-accent-sky)"
        patternWidth={1.5}
      />
      <path
        d={path}
        fill={
          disabled
            ? "transparent"
            : hovered
              ? `url(#vector-region-diagonal-stripes)`
              : "transparent"
        }
        stroke="transparent"
      />
    </svg>
  );
}

export default VectorRegion;
