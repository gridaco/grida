import { cmath } from "@grida/cmath";
import React from "react";
// import type { Rectangle } from "../types";
// import * as k from "./k";

export function SizeMeterLabel({
  size,
  offset = 0,
  rect,
  className,
}: {
  size: cmath.Vector2;
  offset?: number;
} & {
  rect: cmath.Rectangle;
  className?: string;
}) {
  const { x, y, width, height } = rect;
  const bottomY = y + height;
  const centerX = x + width / 2;

  const text = `${+size[0].toFixed(2)} x ${+size[1].toFixed(2)}`;

  return (
    <MeterLabel
      label={text}
      x={centerX}
      y={bottomY}
      side="bottom"
      sideOffset={offset}
      className={className}
    />
  );
}

export function MeterLabel({
  x,
  y,
  label,
  side,
  sideOffset,
  className,
}: {
  x: number;
  y: number;
  label: string;
  side: "left" | "right" | "top" | "bottom";
  sideOffset: number;
  className?: string;
}) {
  let t: [number, number] = [0, 0];
  switch (side) {
    case "left":
      t = [-sideOffset, 0];
      break;
    case "right":
      t = [sideOffset, 0];
      break;
    case "top":
      t = [0, -sideOffset];
      break;
    case "bottom":
      t = [0, sideOffset];
      break;
  }

  const [tx, ty] = t;

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: x + tx,
        top: y + ty,
        transform: "translate(-50%, -50%)",
        padding: "2px 4px",
        fontSize: 10,
        borderRadius: 4,
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}
