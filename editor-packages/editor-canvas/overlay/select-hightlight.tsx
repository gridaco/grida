import React, { useRef } from "react";
import type { OutlineProps } from "./types";
import { color_layer_highlight } from "../theme";
import { get_boinding_box } from "./math";
import { OulineSide } from "./outline-side";
import { OverlayContainer } from "./overlay-container";
import { Handle } from "./handle";
import { useDrag } from "@use-gesture/react";
import type { OnDragHandler } from "../canvas-event-target";

export function SelectHightlight({
  width = 1,
  onResize,
  ...props
}: OutlineProps & {
  onResize?: (anchor: "nw" | "ne" | "sw" | "se", e) => void;
}) {
  const { xywh, zoom, rotation } = props;
  const bbox = get_boinding_box({ xywh, scale: zoom });
  const wh: [number, number] = [xywh[2], xywh[3]];

  const sideprops = {
    wh: wh,
    zoom: props.zoom,
    width: width,
    readonly: false,
    box: bbox,
    color: color_layer_highlight,
  };

  const onresizecb = (anchor: "nw" | "ne" | "sw" | "se") => (e) => {
    if (onResize) {
      onResize(anchor, e);
    }
  };

  return (
    <OverlayContainer xywh={bbox} rotation={rotation}>
      <>
        <ResizeHandle box={bbox} anchor="ne" onDrag={onresizecb("ne")} />
        <ResizeHandle box={bbox} anchor="nw" onDrag={onresizecb("nw")} />
        <ResizeHandle box={bbox} anchor="se" onDrag={onresizecb("se")} />
        <ResizeHandle box={bbox} anchor="sw" onDrag={onresizecb("sw")} />
      </>
      <>
        <OulineSide orientation="w" {...sideprops} cursor="w-resize" />
        <OulineSide orientation="n" {...sideprops} cursor="n-resize" />
        <OulineSide orientation="s" {...sideprops} cursor="s-resize" />
        <OulineSide orientation="e" {...sideprops} cursor="e-resize" />
      </>
    </OverlayContainer>
  );
}

function ResizeHandle({
  anchor,
  box,
  onDrag,
}: {
  anchor: "nw" | "ne" | "sw" | "se";
  box: [number, number, number, number];
  onDrag: OnDragHandler;
}) {
  const ref = useRef();
  useDrag(onDrag, {
    target: ref,
  });

  return (
    <div ref={ref}>
      <Handle
        cursor={`${anchor}-resize`}
        readonly={false}
        color={"white"}
        anchor={anchor}
        box={box}
        borderRadius={1}
        outlineWidth={1}
        outlineColor={color_layer_highlight}
        size={6}
      />
    </div>
  );
}
