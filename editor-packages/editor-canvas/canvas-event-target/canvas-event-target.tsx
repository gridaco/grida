import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGesture } from "@use-gesture/react";
import type { Handler, WebKitGestureEvent } from "@use-gesture/react";
import styled from "@emotion/styled";

export type OnPanningHandler = Handler<"wheel", WheelEvent>;

export type OnZoomingHandler = Handler<
  "pinch",
  WheelEvent | PointerEvent | TouchEvent | WebKitGestureEvent
>;

export function CanvasEventTarget({
  onPanning,
  onZooming,
}: {
  onPanning: OnPanningHandler;
  onZooming: OnZoomingHandler;
}) {
  const interactionEventTargetRef = useRef();

  useGesture(
    {
      onPinch: onZooming,
      onWheel: onPanning,
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
