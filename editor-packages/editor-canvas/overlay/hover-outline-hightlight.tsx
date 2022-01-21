import React from "react";

interface XYWHRotation {
  type: "xywhr";
  xywh: [number, number, number, number];
  rotation?: number;
  zoom: number;
}

type OutlineProps = XYWHRotation;

export function HoverOutlineHightlight(props: OutlineProps) {
  return (
    <>
      <OulineSide orientation="r" xywh={props.xywh} zoom={props.zoom} />
      <OulineSide orientation="l" xywh={props.xywh} zoom={props.zoom} />
      <OulineSide orientation="b" xywh={props.xywh} zoom={props.zoom} />
      <OulineSide orientation="t" xywh={props.xywh} zoom={props.zoom} />
    </>
  );
}

function OulineSide({
  xywh,
  orientation,
  zoom,
}: {
  xywh: [number, number, number, number];
  zoom: number;
  orientation: "l" | "t" | "r" | "b";
}) {
  const d = 100;
  const [x, y, w, h] = xywh;
  const ishoriz = orientation === "l" || orientation === "r";
  const scalex = ishoriz ? 1 / d : d / w;
  const scaley = ishoriz ? d / h : 1 / d;

  const xdelta = ishoriz ? (orientation === "l" ? -w / 2 : w / 2) : 0;
  const ydelta = ishoriz ? 0 : orientation === "t" ? -h / 2 : h / 2;
  const transx = x * zoom + xdelta;
  const transy = y * zoom + ydelta;

  return (
    <div
      style={{
        position: "fixed",
        width: d,
        height: d,
        opacity: 1,
        willChange: "transform",
        transformOrigin: "0px, 0px",
        transform: `translateX(${transx}px) translateY(${transy}px) translateZ(0px) scaleX(${scalex}) scaleY(${scaley})`,
        backgroundColor: "#0099ff",
      }}
    />
  );
}
