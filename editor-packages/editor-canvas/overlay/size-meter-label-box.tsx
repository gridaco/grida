import React, { useMemo } from "react";
import type { XYWH } from "../types";
import { xywh_to_bounding_box } from "../math";
import * as k from "./k";

const font_size = 10;

export function SizeMeterLabelBox({
  size,
  anchor = "s",
  margin = 0,
  xywh,
  zoom,
  background = "rgb(0, 87, 255)",
}: {
  background?: React.CSSProperties["background"];
  size: string | { width: number; height: number };
  anchor?: "w" | "n" | "s" | "e";
  margin?: number;
} & {
  xywh: XYWH;
  zoom: number;
}) {
  // TODO: add anchor handling

  const bbox = useMemo(
    () => xywh_to_bounding_box({ xywh, scale: zoom }),
    [xywh, zoom]
  );

  const [x1, y1, x2, y2] = bbox;
  const bottomY = y2;
  const boxWidth = x2 - x1; // use this to center position the label

  const text =
    typeof size === "string"
      ? size
      : `${+size.width.toFixed(2)} x ${+size.height.toFixed()}`;

  const labelwidth = (text.length * font_size) / 1.8; // a view width assumption (we will not use flex box for faster painting)
  const viewwidth = labelwidth + 4; // 4 is for horizontal padding

  const [tx, ty] = [x1 + boxWidth / 2 - viewwidth / 2, y2 + margin];

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
        fontWeight: 500,
        textAlign: "center",
        zIndex: k.Z_INDEX_GUIDE_LABEL,
      }}
    >
      {text}
    </div>
  );
}
