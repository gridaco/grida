import React from "react";
import type { Box } from "../types";
import * as k from "./k";

const font_size = 10;

export function SizeMeterLabel({
  size,
  margin = 0,
  box,
  zoom,
}: {
  size: { width: number; height: number };
  margin?: number;
} & {
  box: Box;
  zoom: number;
}) {
  const [x1, y1, x2, y2] = box;
  const bottomY = y2;
  const boxWidth = x2 - x1; // use this to center position the label

  const text = `${+size.width.toFixed(2)} x ${+size.height.toFixed()}`;

  return (
    <MeterLabel
      label={text}
      background={"rgb(0, 87, 255)"}
      x={x1 + boxWidth / 2}
      y={y2}
      anchor="s"
      margin={margin}
      zoom={zoom}
      zIndex={k.Z_INDEX_GUIDE_LABEL}
    />
  );
}

export function MeterLabel({
  x,
  y,
  background,
  label,
  anchor,
  zoom,
  margin = 0,
  zIndex = k.Z_INDEX_GUIDE_LABEL,
  weight = 500,
}: {
  x: number;
  y: number;
  weight?: React.CSSProperties["fontWeight"];
  background?: React.CSSProperties["background"];
  label: string;
  anchor: "w" | "n" | "s" | "e";
  margin?: number;
  zoom: number;
  zIndex?: number;
}) {
  const labelwidth = (label.length * font_size) / 1.8; // a view width assumption (we will not use flex box for faster painting)
  const viewwidth = labelwidth + 4; // 4 is for horizontal padding
  const viewheight = font_size + 4; // 4 is for vertical padding

  let t = [0, 0];
  switch (anchor) {
    case "s": {
      t = [x * zoom - viewwidth / 2, y * zoom + margin];
      break;
    }
    case "n": {
      t = [x * zoom - viewwidth / 2, y * zoom - margin];
      break;
    }
    case "e": {
      t = [x * zoom + margin, y * zoom - viewheight / 2];
      break;
    }
    case "w": {
      t = [x * zoom - margin, y * zoom - viewheight / 2];
      break;
    }
  }

  const [tx, ty] = t;

  return (
    <div
      id="size-meter"
      style={{
        minWidth: viewwidth,
        position: "absolute",
        pointerEvents: "none",
        transform: `translate3d(${tx}px, ${ty}px, 0)`,
        willChange: "transform, opacity",
        boxSizing: "border-box",
        whiteSpace: "nowrap",
        borderRadius: 4,
        background: background,
        padding: "2px 4px",
        color: "white",
        fontSize: font_size,
        fontFamily: "Inter, sans-serif",
        fontWeight: weight,
        textAlign: "center",
        zIndex: zIndex,
      }}
    >
      {label}
    </div>
  );
}
