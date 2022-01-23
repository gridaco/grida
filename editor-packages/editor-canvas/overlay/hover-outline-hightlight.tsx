import React from "react";
import { color_layer_highlight } from "../theme";
interface XYWHRotation {
  type: "xywhr";
  xywh: [number, number, number, number];
  rotation?: number;
  zoom: number;
}

type OutlineProps = XYWHRotation & {
  width?: number;
};

export function HoverOutlineHightlight({ width = 1, ...props }: OutlineProps) {
  return (
    <>
      <OulineSide
        orientation="l"
        xywh={props.xywh}
        zoom={props.zoom}
        width={width}
      />
      <OulineSide
        orientation="t"
        xywh={props.xywh}
        zoom={props.zoom}
        width={width}
      />
      <OulineSide
        orientation="b"
        xywh={props.xywh}
        zoom={props.zoom}
        width={width}
      />
      <OulineSide
        orientation="r"
        xywh={props.xywh}
        zoom={props.zoom}
        width={width}
      />
    </>
  );
}

function OulineSide({
  xywh,
  orientation,
  zoom,
  width,
}: {
  xywh: [number, number, number, number];
  zoom: number;
  orientation: "l" | "t" | "r" | "b";
  width: number;
}) {
  const d = 100;
  const [, , w, h] = xywh;

  // is vertical line
  const isvert = orientation === "l" || orientation === "r";
  const l_scalex = isvert ? width / d : (w / d) * zoom;
  const l_scaley = isvert ? (h / d) * zoom : width / d;

  const bbox = get_boinding_box({ xywh, scale: zoom });

  let trans = { x: 0, y: 0 };
  switch (orientation) {
    case "l": {
      trans = {
        x: bbox[0] - d / 2,
        y: bbox[1] + (d * l_scaley - d) / 2,
      };
      break;
    }
    case "r": {
      trans = {
        x: bbox[2] - d / 2,
        y: bbox[1] + (d * l_scaley - d) / 2,
      };
      break;
    }
    case "t": {
      trans = {
        x: bbox[0] + (d * l_scalex - d) / 2,
        y: bbox[1] - d / 2,
      };
      break;
    }
    case "b": {
      trans = {
        x: bbox[0] + (d * l_scalex - d) / 2,
        y: bbox[3] - d / 2,
      };
      break;
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        width: d,
        height: d,
        opacity: 1,
        willChange: "transform",
        transformOrigin: "0px, 0px",
        transform: `translateX(${trans.x}px) translateY(${trans.y}px) translateZ(0px) scaleX(${l_scalex}) scaleY(${l_scaley})`,
        backgroundColor: color_layer_highlight,
      }}
    />
  );
}

function get_boinding_box({
  xywh,
  scale,
}: {
  xywh: [number, number, number, number];
  scale: number;
}): [number, number, number, number] {
  const [x, y, w, h] = xywh;
  const [x1, y1, x2, y2] = [
    x * scale,
    y * scale,
    x * scale + w * scale,
    y * scale + h * scale,
  ];
  return [x1, y1, x2, y2];
}
