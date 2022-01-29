import React from "react";
import { color_layer_highlight } from "../theme";
import { get_boinding_box } from "./math";
import { OulineSide } from "./outline-side";
import type { OutlineProps } from "./types";

export function HoverOutlineHighlight({ width = 1, ...props }: OutlineProps) {
  const { xywh, zoom } = props;
  const bbox = get_boinding_box({ xywh, scale: zoom });
  const wh: [number, number] = [xywh[2], xywh[3]];
  return (
    <>
      <OulineSide
        orientation="l"
        wh={wh}
        zoom={props.zoom}
        width={width}
        box={bbox}
        color={color_layer_highlight}
      />
      <OulineSide
        orientation="t"
        wh={wh}
        zoom={props.zoom}
        width={width}
        box={bbox}
        color={color_layer_highlight}
      />
      <OulineSide
        orientation="b"
        wh={wh}
        zoom={props.zoom}
        width={width}
        box={bbox}
        color={color_layer_highlight}
      />
      <OulineSide
        orientation="r"
        wh={wh}
        zoom={props.zoom}
        width={width}
        box={bbox}
        color={color_layer_highlight}
      />
    </>
  );
}
