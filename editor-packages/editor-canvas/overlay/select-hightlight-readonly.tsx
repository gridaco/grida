import React from "react";
import type { OutlineProps } from "./types";
import { color_layer_readonly_highlight } from "../theme";
import { xywh_to_bounding_box } from "../math";
import { OulineSide } from "./outline-side";
import { OverlayContainer } from "./overlay-container";
import { Handle } from "./handle";

export function ReadonlySelectHightlight({
  width = 1,
  ...props
}: OutlineProps) {
  const { xywh, zoom, rotation } = props;
  const bbox = xywh_to_bounding_box({ xywh, scale: zoom });
  const wh: [number, number] = [xywh[2], xywh[3]];

  const handle_outline_width = width;
  const handle_size = 3;
  const dot_size = 4;

  const sideprops = {
    wh: wh,
    zoom: props.zoom,
    width: width,
    box: bbox,
    color: color_layer_readonly_highlight,
  };

  return (
    <OverlayContainer xywh={bbox} rotation={rotation}>
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
          side="w"
          size={dot_size}
          color={color_layer_readonly_highlight}
        />
        <SideCenterEmp
          box={bbox}
          side="e"
          size={dot_size}
          color={color_layer_readonly_highlight}
        />
        <SideCenterEmp
          box={bbox}
          side="n"
          size={dot_size}
          color={color_layer_readonly_highlight}
        />
        <SideCenterEmp
          box={bbox}
          side="s"
          size={dot_size}
          color={color_layer_readonly_highlight}
        />
      </>
      <>
        <OulineSide orientation="w" {...sideprops} />
        <OulineSide orientation="n" {...sideprops} />
        <OulineSide orientation="s" {...sideprops} />
        <OulineSide orientation="e" {...sideprops} />
      </>
    </OverlayContainer>
  );
}

function SideCenterEmp({
  side,
  color,
  box,
  size = 3,
}: {
  side: "w" | "e" | "n" | "s";
  color: string;
  box: [number, number, number, number];
  size?: number;
}) {
  let dx = 0;
  let dy = 0;
  switch (side) {
    case "w":
      dx = box[0];
      dy = box[1] + (box[3] - box[1]) / 2;
      break;
    case "e":
      dx = box[2];
      dy = box[1] + (box[3] - box[1]) / 2;
      break;
    case "n":
      dx = box[0] + (box[2] - box[0]) / 2;
      dy = box[1];
      break;
    case "s":
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
  return (
    <Handle
      borderRadius={"50%"}
      readonly
      color={color}
      anchor={anchor}
      box={box}
      outlineWidth={outlineWidth}
      outlineColor={outlineColor}
      size={size}
    />
  );
}
