import React from "react";
import type { XYWH } from "../types";

const canvasSelectionRectBackgroundColor = "rgba(0, 87, 255, 0.15)";
const canvasSelectionRectBorderColor = "rgb(0, 87, 255)";

export function Marquee({ rect }: { rect: XYWH }) {
  const [x, y, ow, oh] = rect;

  let [w, h, r] = [ow, oh, 0];
  if (w < 0 && h >= 0) {
    w = oh;
    h = ow;
    r = 90;
  } else if (h < 0 && w >= 0) {
    r = -90;
    w = oh;
    h = ow;
  } else if (w < 0 && h < 0) {
    r = 180;
  } else {
    r = 0;
  }

  return (
    <div
      style={{
        position: "absolute",
        backgroundColor: canvasSelectionRectBackgroundColor,
        width: Math.abs(w),
        height: Math.abs(h),
        willChange: "transform, opacity",
        transformOrigin: "0px 0px",
        transform: `translate3d(${x}px, ${y}px, 0) rotate(${r}deg)`,
        border: `${canvasSelectionRectBorderColor} 1px solid`,
      }}
    ></div>
  );
}
