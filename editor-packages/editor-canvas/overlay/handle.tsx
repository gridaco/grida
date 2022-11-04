import React, { forwardRef } from "react";
import * as k from "./k";

export const Handle = forwardRef(function (
  {
    color,
    anchor,
    box,
    outlineWidth = 1,
    outlineColor = "transparent",
    size = 4,
    borderRadius = 0,
    cursor,
    readonly,
  }: {
    color: string;
    /**
     * the width of the outline
     */
    outlineWidth?: number;
    outlineColor?: string;
    size: number;
    anchor: "nw" | "ne" | "sw" | "se";
    box: [number, number, number, number];
    borderRadius?: React.CSSProperties["borderRadius"];
    cursor?: React.CSSProperties["cursor"];
    readonly?: boolean;
  },
  ref
) {
  let dx = 0;
  let dy = 0;
  switch (anchor) {
    case "nw":
      dx = box[0];
      dy = box[1];
      break;
    case "ne":
      dx = box[2];
      dy = box[1];
      break;
    case "sw":
      dx = box[0];
      dy = box[3];
      break;
    case "se":
      dx = box[2];
      dy = box[3];
      break;
  }

  // translate x, y
  const [tx, ty] = [dx - size / 2 - outlineWidth, dy - size / 2 - outlineWidth];

  return (
    <div
      style={{
        position: "absolute",
        borderRadius: borderRadius,
        width: size,
        height: size,
        border: outlineWidth && `${outlineColor} solid ${outlineWidth}px`,
        willChange: "transform",
        transform: `translate3d(${tx}px, ${ty}px, 0)`,
        backgroundColor: color,
        cursor: cursor,
        zIndex: k.Z_INDEX_GUIDE_POSITION,
        pointerEvents: readonly ? "none" : "auto",
      }}
    />
  );
});
