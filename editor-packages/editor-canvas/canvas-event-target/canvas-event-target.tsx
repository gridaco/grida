import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGesture } from "@use-gesture/react";
import type { Handler, WebKitGestureEvent } from "@use-gesture/react";
import styled from "@emotion/styled";

export type OnPanningHandler = Handler<"wheel", WheelEvent>;

export type OnZoomingHandler = Handler<
  "pinch",
  WheelEvent | PointerEvent | TouchEvent | WebKitGestureEvent
>;

export type OnPointerMoveHandler = Handler<"move">;

export function CanvasEventTarget({
  onPanning,
  onPanningStart,
  onPanningEnd,
  onZooming,
  onZoomingStart,
  onZoomingEnd,
  onPointerMove,
  onPointerMoveStart,
  onPointerMoveEnd,
}: {
  onPanning: OnPanningHandler;
  onPanningStart: OnPanningHandler;
  onPanningEnd: OnPanningHandler;
  onZooming: OnZoomingHandler;
  onZoomingStart: OnZoomingHandler;
  onZoomingEnd: OnZoomingHandler;
  onPointerMove: OnPointerMoveHandler;
  onPointerMoveStart: OnPointerMoveHandler;
  onPointerMoveEnd: OnPointerMoveHandler;
}) {
  const interactionEventTargetRef = useRef();

  useGesture(
    {
      onPinch: onZooming,
      onPinchStart: onZoomingStart,
      onPinchEnd: onZoomingEnd,
      onWheel: onPanning,
      onWheelStart: onPanningStart,
      onWheelEnd: onPanningEnd,
      onMove: onPointerMove,
      onMoveStart: onPointerMoveStart,
      onMoveEnd: onPointerMoveEnd,
    },
    { target: interactionEventTargetRef }
  );

  return (
    <EventTargetContainer
      id="gesture-event-listener"
      ref={interactionEventTargetRef}
    />
  );
}

const EventTargetContainer = styled.div`
  position: absolute;
  inset: 0px;
  background: transparent;
  overflow: hidden;
  touch-action: none;
`;
