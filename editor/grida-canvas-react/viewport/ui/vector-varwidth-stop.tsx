import cmath from "@grida/cmath";
import { Point } from "./point";

export function VariableWidthStop({
  u,
  p,
  angle,
  r,
}: {
  u: number;
  p: cmath.Vector2;
  angle: number;
  r: number;
}) {
  // 1. point at p
  // 2. 2 mirrored points with p - r / p + r (and line between them)
  // 3. apply angle (angle on a curve at u)

  // Calculate the perpendicular direction based on the angle
  const perpAngle = angle + Math.PI / 2; // Perpendicular to the curve
  const perpVector: cmath.Vector2 = [Math.cos(perpAngle), Math.sin(perpAngle)];

  // Calculate the two points on either side of the curve
  const pl: cmath.Vector2 = [
    p[0] - perpVector[0] * r,
    p[1] - perpVector[1] * r,
  ];

  const pr: cmath.Vector2 = [
    p[0] + perpVector[0] * r,
    p[1] + perpVector[1] * r,
  ];

  return (
    <>
      {/* Center point */}
      <Point
        point={p}
        size={8}
        shape="circle"
        style={{ zIndex: 10 }}
        className="border-workbench-accent-pink data-[selected='true']:bg-workbench-accent-pink data-[hovered='true']:border-workbench-accent-pink/50"
      />

      {/* Left width point */}
      <Point
        point={pl}
        size={6}
        shape="diamond"
        style={{ zIndex: 9 }}
        className="border-workbench-accent-pink data-[selected='true']:bg-workbench-accent-pink data-[hovered='true']:border-workbench-accent-pink/50"
      />

      {/* Right width point */}
      <Point
        point={pr}
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
          x1={pl[0]}
          y1={pl[1]}
          x2={pr[0]}
          y2={pr[1]}
          stroke="currentColor"
          strokeWidth={1}
          className="stroke-gray-400"
        />
      </svg>
    </>
  );
}
