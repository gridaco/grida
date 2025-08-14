import cmath from "@grida/cmath";
import { useGesture } from "@use-gesture/react";
import { Point } from "./point";
import { useState } from "react";

export function VariableWidthStop({
  u,
  p,
  angle,
  r,
  index,
  selected,
  onSelect,
  onUDragStart,
  onRDragStart,
  transform,
}: {
  u: number;
  p: cmath.Vector2;
  angle: number;
  r: number;
  index: number;
  selected: boolean;
  onSelect: (stop: number, additive?: boolean) => void;
  onUDragStart: (stop: number) => void;
  onRDragStart: (stop: number, side: "left" | "right") => void;
  transform: cmath.Transform;
}) {
  const [uHovered, setUHovered] = useState(false);
  const [rHovered, setRHovered] = useState(false);
  // 1. point at p
  // 2. 2 mirrored points with p - r / p + r (and line between them)
  // 3. apply angle (angle on a curve at u)

  // Calculate the perpendicular direction based on the angle
  const perpAngle = angle + Math.PI / 2; // Perpendicular to the curve
  const perpVector: cmath.Vector2 = [Math.cos(perpAngle), Math.sin(perpAngle)];

  // Calculate the two points on either side of the curve in original coordinate space
  const pl_original: cmath.Vector2 = [
    p[0] - perpVector[0] * r,
    p[1] - perpVector[1] * r,
  ];

  const pr_original: cmath.Vector2 = [
    p[0] + perpVector[0] * r,
    p[1] + perpVector[1] * r,
  ];

  // Transform all points to screen coordinates
  const p_screen = cmath.vector2.transform(p, transform);
  const pl_screen = cmath.vector2.transform(pl_original, transform);
  const pr_screen = cmath.vector2.transform(pr_original, transform);

  const bindU = useGesture(
    {
      onPointerDown: ({ event }) => {
        event.preventDefault();
        onSelect(index, event.shiftKey);
      },
      onDragStart: ({ event }) => {
        event.preventDefault();
        onUDragStart(index);
      },
      onHover: ({ hovering }) => {
        setUHovered(hovering ?? false);
      },
    },
    {
      drag: {
        threshold: 1,
      },
    }
  );

  const bindLeft = useGesture(
    {
      onPointerDown: ({ event }) => {
        event.preventDefault();
        onSelect(index, event.shiftKey);
      },
      onDragStart: ({ event }) => {
        event.preventDefault();
        onRDragStart(index, "left");
      },
      onHover: ({ hovering }) => {
        setRHovered(hovering ?? false);
      },
    },
    {
      drag: {
        threshold: 1,
      },
    }
  );

  const bindRight = useGesture(
    {
      onPointerDown: ({ event }) => {
        event.preventDefault();
        onSelect(index, event.shiftKey);
      },
      onDragStart: ({ event }) => {
        event.preventDefault();
        onRDragStart(index, "right");
      },
      onHover: ({ hovering }) => {
        setRHovered(hovering ?? false);
      },
    },
    {
      drag: {
        threshold: 1,
      },
    }
  );

  return (
    <>
      {/* Center point */}
      <Point
        {...bindU()}
        point={p_screen}
        size={8}
        shape="circle"
        style={{ zIndex: 10 }}
        selected={selected || rHovered || uHovered}
        className="border-workbench-accent-pink data-[selected='true']:bg-workbench-accent-pink data-[hovered='true']:border-workbench-accent-pink/50"
      />

      {/* Left width point */}
      <Point
        {...bindLeft()}
        point={pl_screen}
        size={6}
        shape="diamond"
        style={{ zIndex: 9 }}
        className="border-workbench-accent-pink data-[selected='true']:bg-workbench-accent-pink data-[hovered='true']:border-workbench-accent-pink/50"
      />

      {/* Right width point */}
      <Point
        {...bindRight()}
        point={pr_screen}
        size={6}
        shape="diamond"
        style={{ zIndex: 9 }}
        className="border-workbench-accent-pink data-[selected='true']:bg-workbench-accent-pink data-[hovered='true']:border-workbench-accent-pink/50"
      />

      {/* Line connecting the width points */}
      <svg
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          left: 0,
          top: 0,
          overflow: "visible",
          pointerEvents: "none",
          zIndex: 8,
        }}
      >
        <line
          x1={pl_screen[0]}
          y1={pl_screen[1]}
          x2={pr_screen[0]}
          y2={pr_screen[1]}
          stroke="currentColor"
          strokeWidth={1}
          className="stroke-gray-400"
        />
      </svg>
    </>
  );
}
