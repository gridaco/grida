import React from "react";
import type { OutlineProps } from "./types";
import { color_layer_readonly_highlight } from "../theme";
import { get_boinding_box } from "./math";
import { OulineSide } from "./outline-side";

export function ReadonlySelectHightlight({
  width = 1,
  ...props
}: OutlineProps) {
  const { xywh, zoom } = props;
  const bbox = get_boinding_box({ xywh, scale: zoom });
  const wh: [number, number] = [xywh[2], xywh[3]];

  const handle_outline_width = width;
  const handle_size = 3;
  const dot_size = 4;

  return (
    <>
      <>
        <ReadonlyHandle
          box={bbox}
          anchor="ne"
          color={"white"}
          outlineColor={color_layer_readonly_highlight}
          outlineWidth={handle_outline_width}
          size={handle_size}
        />
        <ReadonlyHandle
          box={bbox}
          anchor="nw"
          color={"white"}
          outlineColor={color_layer_readonly_highlight}
          outlineWidth={handle_outline_width}
          size={handle_size}
        />
        <ReadonlyHandle
          box={bbox}
          anchor="se"
          color={"white"}
          outlineColor={color_layer_readonly_highlight}
          outlineWidth={handle_outline_width}
          size={handle_size}
        />
        <ReadonlyHandle
          box={bbox}
          anchor="sw"
          color={"white"}
          outlineColor={color_layer_readonly_highlight}
          outlineWidth={handle_outline_width}
          size={handle_size}
        />
      </>
      <>
        <SideCenterEmp
          box={bbox}
          side="l"
          size={dot_size}
          color={color_layer_readonly_highlight}
        />
        <SideCenterEmp
          box={bbox}
          side="r"
          size={dot_size}
          color={color_layer_readonly_highlight}
        />
        <SideCenterEmp
          box={bbox}
          side="t"
          size={dot_size}
          color={color_layer_readonly_highlight}
        />
        <SideCenterEmp
          box={bbox}
          side="b"
          size={dot_size}
          color={color_layer_readonly_highlight}
        />
      </>
      <>
        <OulineSide
          orientation="l"
          wh={wh}
          zoom={props.zoom}
          width={width}
          box={bbox}
          color={color_layer_readonly_highlight}
        />
        <OulineSide
          orientation="t"
          wh={wh}
          zoom={props.zoom}
          width={width}
          box={bbox}
          color={color_layer_readonly_highlight}
        />
        <OulineSide
          orientation="b"
          wh={wh}
          zoom={props.zoom}
          width={width}
          box={bbox}
          color={color_layer_readonly_highlight}
        />
        <OulineSide
          orientation="r"
          wh={wh}
          zoom={props.zoom}
          width={width}
          box={bbox}
          color={color_layer_readonly_highlight}
        />
      </>
    </>
  );
}

function SideCenterEmp({
  side,
  color,
  box,
  size = 3,
}: {
  side: "l" | "r" | "t" | "b";
  color: string;
  box: [number, number, number, number];
  size?: number;
}) {
  let dx = 0;
  let dy = 0;
  switch (side) {
    case "l":
      dx = box[0];
      dy = box[1] + (box[3] - box[1]) / 2;
      break;
    case "r":
      dx = box[2];
      dy = box[1] + (box[3] - box[1]) / 2;
      break;
    case "t":
      dx = box[0] + (box[2] - box[0]) / 2;
      dy = box[1];
      break;
    case "b":
      dx = box[0] + (box[2] - box[0]) / 2;
      dy = box[3];
      break;
  }

  // translate x, y
  const [tx, ty] = [dx - size / 2, dy - size / 2];

  return (
    <div
      style={{
        position: "absolute",
        borderRadius: "50%",
        width: size,
        height: size,
        zIndex: 1,
        backgroundColor: color,
        willChange: "transform",
        transform: `translateX(${tx}px) translateY(${ty}px)`,
      }}
    />
  );
}

function ReadonlyHandle({
  color,
  anchor,
  box,
  outlineWidth = 1,
  outlineColor,
  size = 4,
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
        borderRadius: "50%",
        width: size,
        height: size,
        border: `${outlineColor} solid ${outlineWidth}px`,
        willChange: "transform",
        transform: `translateX(${tx}px) translateY(${ty}px)`,
        backgroundColor: color,
        zIndex: 1,
      }}
    />
  );
}
