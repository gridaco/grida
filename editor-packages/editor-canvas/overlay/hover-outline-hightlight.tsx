import React from "react";
import { color_layer_highlight } from "../theme";
import { get_boinding_box } from "./math";
import { OulineSide } from "./outline-side";
import { OverlayContainer } from "./overlay-container";
import type { OutlineProps } from "./types";

export function HoverOutlineHighlight({ width = 1, ...props }: OutlineProps) {
  const { xywh, zoom, rotation } = props;
  const bbox = get_boinding_box({ xywh, scale: zoom });
  const wh: [number, number] = [xywh[2], xywh[3]];
  const vprops = {
    wh: wh,
    zoom: props.zoom,
    width: width,
    box: bbox,
    color: color_layer_highlight,
  };

  return (
    <OverlayContainer xywh={bbox} rotation={rotation}>
      <OulineSide orientation="l" {...vprops} />
      <OulineSide orientation="t" {...vprops} />
      <OulineSide orientation="b" {...vprops} />
      <OulineSide orientation="r" {...vprops} />
    </OverlayContainer>
  );
}
