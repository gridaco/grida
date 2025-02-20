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
  onResizeStart,
  onResizeEnd,
  ...props
}: Omit<OutlineProps, "width"> & {
  onResize?: (
    handle: ResizeHandleOrigin,
    delta: [number, number],
    meta: { altKey: boolean; shiftKey: boolean }
  ) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
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

  const onResizeHandleDragNE = (e) =>
    onResize?.("ne", e.delta, { shiftKey: e.shiftKey, altKey: e.altKey });

  const onResizeHandleDragNW = (e) =>
    onResize?.("nw", e.delta, { shiftKey: e.shiftKey, altKey: e.altKey });

  const onResizeHandleDragSE = (e) =>
    onResize?.("se", e.delta, { shiftKey: e.shiftKey, altKey: e.altKey });

  const onResizeHandleDragSW = (e) =>
    onResize?.("sw", e.delta, { shiftKey: e.shiftKey, altKey: e.altKey });

  const onResizeHandleDragN = (e) =>
    onResize?.("n", e.delta, { shiftKey: e.shiftKey, altKey: e.altKey });

  const onResizeHandleDragS = (e) =>
    onResize?.("s", e.delta, { shiftKey: e.shiftKey, altKey: e.altKey });

  const onResizeHandleDragW = (e) =>
    onResize?.("w", e.delta, { shiftKey: e.shiftKey, altKey: e.altKey });

  const onResizeHandleDragE = (e) =>
    onResize?.("e", e.delta, { shiftKey: e.shiftKey, altKey: e.altKey });

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
        <ResizeHandle
          box={bbox}
          anchor="ne"
          onDrag={onResizeHandleDragNE}
          onDragStart={onResizeStart}
          onDragEnd={onResizeEnd}
        />
        <ResizeHandle
          box={bbox}
          anchor="nw"
          onDrag={onResizeHandleDragNW}
          onDragStart={onResizeStart}
          onDragEnd={onResizeEnd}
        />
        <ResizeHandle
          box={bbox}
          anchor="se"
          onDrag={onResizeHandleDragSE}
          onDragStart={onResizeStart}
          onDragEnd={onResizeEnd}
        />
        <ResizeHandle
          box={bbox}
          anchor="sw"
          onDrag={onResizeHandleDragSW}
          onDragStart={onResizeStart}
          onDragEnd={onResizeEnd}
        />
      </>
      <>
        <OulineSide
          orientation="w"
          {...sideprops}
          cursor="ew-resize"
          onDrag={onResizeHandleDragW}
          onDragStart={onResizeStart}
          onDragEnd={onResizeEnd}
        />
        <OulineSide
          orientation="n"
          {...sideprops}
          cursor="ns-resize"
          onDrag={onResizeHandleDragN}
          onDragStart={onResizeStart}
          onDragEnd={onResizeEnd}
        />
        <OulineSide
          orientation="s"
          {...sideprops}
          cursor="ns-resize"
          onDrag={onResizeHandleDragS}
          onDragStart={onResizeStart}
          onDragEnd={onResizeEnd}
        />
        <OulineSide
          orientation="e"
          {...sideprops}
          cursor="ew-resize"
          onDrag={onResizeHandleDragE}
          onDragStart={onResizeStart}
          onDragEnd={onResizeEnd}
        />
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
  onDragStart,
  onDragEnd,
  ...props
}: Partial<Omit<React.ComponentProps<typeof Handle>, "onDrag">> & {
  anchor: "nw" | "ne" | "sw" | "se";
  box: [number, number, number, number];
  onDrag?: OnDragHandler;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGesture(
    {
      onDragStart: (e) => {
        e.event.stopPropagation();
        onDragStart?.();
      },
      onDragEnd: (e) => {
        e.event.stopPropagation();
        onDragEnd?.();
      },
      onDrag: (e) => {
        e.event.stopPropagation();
        onDrag?.(e);
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
  const ref = useRef<HTMLDivElement>(null);
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
