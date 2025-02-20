import React from "react";
import type { OutlineProps } from "./types";
import { color_layer_readonly_highlight } from "../theme";
import { xywh_to_bounding_box } from "../math";
import { OulineSide } from "./outline-side";
import { OverlayContainer } from "./overlay-container";

export function InSelectionGroupSelectHighlight({
  width = 0.3,
  ...props
}: OutlineProps) {
  const { xywh, zoom, rotation } = props;
  const bbox = xywh_to_bounding_box({ xywh, scale: zoom });
  const wh: [number, number] = [xywh[2], xywh[3]];

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
        <OulineSide orientation="w" {...sideprops} />
        <OulineSide orientation="n" {...sideprops} />
        <OulineSide orientation="s" {...sideprops} />
        <OulineSide orientation="e" {...sideprops} />
      </>
    </OverlayContainer>
  );
}
