import React, { useRef } from "react";
import type { OutlineProps, ResizeHandleOrigin } from "./types";
import { color_layer_highlight } from "../theme";
import { xywh_to_bounding_box } from "../math";
import { OulineSide } from "./outline-side";
import { OverlayContainer } from "./overlay-container";
import { Handle } from "./handle";
import { useGesture } from "@use-gesture/react";
import type { OnDragHandler } from "../canvas-event-target";

export function SelectHightlight({
  onResize,
  ...props
}: Omit<OutlineProps, "width"> & {
  onResize?: (
    handle: ResizeHandleOrigin,
    delta: [number, number],
    shiftKey?: boolean
  ) => void;
}) {
  const { xywh, zoom, rotation } = props;
  const bbox = xywh_to_bounding_box({ xywh, scale: zoom });
  const wh: [number, number] = [xywh[2], xywh[3]];

  const sideprops = {
    wh: wh,
    zoom: props.zoom,
    width: 1,
    readonly: false,
    box: bbox,
    color: color_layer_highlight,
  };

  const onResizeHandleDragNE = (e) => onResize?.("ne", e.delta, e.shiftKey);

  const onResizeHandleDragNW = (e) => onResize?.("nw", e.delta, e.shiftKey);

  const onResizeHandleDragSE = (e) => onResize?.("se", e.delta, e.shiftKey);

  const onResizeHandleDragSW = (e) => onResize?.("sw", e.delta, e.shiftKey);

  return (
    <OverlayContainer xywh={bbox} rotation={rotation}>
      {/* TODO: add rotation knob */}
      {/* <>
        <RotateHandle box={bbox} anchor="ne" onDrag={onrotatecb("ne")} />
        <RotateHandle box={bbox} anchor="nw" onDrag={onrotatecb("nw")} />
        <RotateHandle box={bbox} anchor="se" onDrag={onrotatecb("se")} />
        <RotateHandle box={bbox} anchor="sw" onDrag={onrotatecb("sw")} />
      </> */}
      <>
        <ResizeHandle box={bbox} anchor="ne" onDrag={onResizeHandleDragNE} />
        <ResizeHandle box={bbox} anchor="nw" onDrag={onResizeHandleDragNW} />
        <ResizeHandle box={bbox} anchor="se" onDrag={onResizeHandleDragSE} />
        <ResizeHandle box={bbox} anchor="sw" onDrag={onResizeHandleDragSW} />
      </>
      <>
        <OulineSide orientation="w" {...sideprops} cursor="ew-resize" />
        <OulineSide orientation="n" {...sideprops} cursor="ns-resize" />
        <OulineSide orientation="s" {...sideprops} cursor="ns-resize" />
        <OulineSide orientation="e" {...sideprops} cursor="ew-resize" />
      </>
    </OverlayContainer>
  );
}

const resize_cursor_map = {
  nw: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  se: "nwse-resize",
  w: "ew-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
};

function ResizeHandle({
  anchor,
  box,
  onDrag,
  ...props
}: Partial<Omit<React.ComponentProps<typeof Handle>, "onDrag">> & {
  anchor: "nw" | "ne" | "sw" | "se";
  box: [number, number, number, number];
  onDrag?: OnDragHandler;
}) {
  const ref = useRef();

  useGesture(
    {
      onDragStart: (e) => {
        e.event.stopPropagation();
      },
      onDragEnd: (e) => {
        e.event.stopPropagation();
      },
      onDrag: (e) => {
        onDrag?.(e);
        e.event.stopPropagation();
      },
    },
    {
      target: ref,
      eventOptions: {
        capture: false,
      },
    }
  );

  return (
    <Handle
      ref={ref}
      cursor={resize_cursor_map[anchor]}
      readonly={false}
      color={"white"}
      anchor={anchor}
      box={box}
      outlineWidth={1}
      outlineColor={color_layer_highlight}
      size={8}
      {...props}
    />
  );
}

function RotateHandle({
  anchor,
  box,
  onDrag,
}: {
  anchor: "nw" | "ne" | "sw" | "se";
  box: [number, number, number, number];
  onDrag: OnDragHandler;
}) {
  const ref = useRef();
  useGesture(
    {
      onDragStart: (e) => {
        e.event.stopPropagation();
      },
      onDragEnd: (e) => {
        e.event.stopPropagation();
      },
      onDrag: (e) => {
        onDrag(e);
        e.event.stopPropagation();
      },
    },
    {
      target: ref,
      eventOptions: {
        capture: false,
      },
    }
  );

  return (
    <Handle
      ref={ref}
      cursor={"crosshair"} // FIXME:
      readonly={false}
      // center={false}
      color={"transparent"}
      anchor={anchor}
      box={box}
      outlineWidth={1}
      size={18}
    />
  );
}
