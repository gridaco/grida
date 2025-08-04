import cmath from "@grida/cmath";
import { MeterLabel } from "./meter";

export function Line({
  x1,
  y1,
  x2,
  y2,
  label,
  zIndex = 10,
}: cmath.ui.Line & { zIndex?: number }) {
  const angle = cmath.vector2.angle([x1, y1], [x2, y2]);
  const side = cmath.angleToAxis(angle) === "x" ? "bottom" : "right";
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

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
          zIndex,
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
      )}
    </>
  );
}
