import React from "react";
export function Handle({
  color,
  anchor,
  box,
  outlineWidth = 1,
  outlineColor,
  size = 4,
  borderRadius = 0,
  cursor,
  readonly,
}: {
  color: string;
  /**
   * the width of the outline
   */
  outlineWidth: number;
  outlineColor: string;
  size: number;
  anchor: "nw" | "ne" | "sw" | "se";
  box: [number, number, number, number];
  borderRadius?: React.CSSProperties["borderRadius"];
  cursor?: React.CSSProperties["cursor"];
  readonly?: boolean;
}) {
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
        border: `${outlineColor} solid ${outlineWidth}px`,
        willChange: "transform",
        transform: `translate3d(${tx}px, ${ty}px, 0)`,
        backgroundColor: color,
        cursor: cursor,
        zIndex: 1,
        pointerEvents: readonly ? "none" : "all",
      }}
    />
  );
}
