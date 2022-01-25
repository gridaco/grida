import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGesture } from "@use-gesture/react";
import type {
  Handler,
  WebKitGestureEvent,
  SharedGestureState,
} from "@use-gesture/react";
import styled from "@emotion/styled";

export type OnPanningHandler = Handler<"wheel", WheelEvent>;

export type OnZoomingHandler = Handler<
  "pinch",
  WheelEvent | PointerEvent | TouchEvent | WebKitGestureEvent
>;

export type OnPointerMoveHandler = Handler<"move">;

export type OnPointerDownHandler = (
  e: { event: React.MouseEvent<EventTarget, MouseEvent> } & SharedGestureState
) => void;

const ZOOM_WITH_SCROLL_SENSITIVITY = 0.001;

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
  onPointerDown,
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
  onPointerDown: OnPointerDownHandler;
}) {
  const interactionEventTargetRef = useRef();

  let platform: PlatformName = "other";
  useEffect(() => {
    platform = getCurrentPlatform(window.navigator);
  });

  const transform_wheel_to_zoom = (s) => {
    return {
      ...s,
      delta: [-s.delta[1] * ZOOM_WITH_SCROLL_SENSITIVITY, 0],
    };
  };

  useGesture(
    {
      onPinch: onZooming,
      onPinchStart: onZoomingStart,
      onPinchEnd: onZoomingEnd,
      onWheel: (s) => {
        if (s.ctrlKey) {
          // crtl key is also enabled on onPinch - we don't have to explicitly add linux & windows support for ctrl + scroll.
          return;
        } else {
          // only for mac
          if (s.metaKey) {
            onZooming(transform_wheel_to_zoom(s));
            return;
          }
        }
        onPanning(s);
      },
      onWheelStart: onPanningStart,
      onWheelEnd: onPanningEnd,
      onMove: onPointerMove,
      onMouseDown: onPointerDown,
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

type PlatformName = "mac" | "win" | "linux" | "other";

const getCurrentPlatform = (navigator?: { platform: string }): PlatformName =>
  typeof navigator === "undefined"
    ? "other"
    : /Mac/.test(navigator.platform)
    ? "mac"
    : /Win/.test(navigator.platform)
    ? "win"
    : /Linux|X11/.test(navigator.platform)
    ? "linux"
    : "other";
