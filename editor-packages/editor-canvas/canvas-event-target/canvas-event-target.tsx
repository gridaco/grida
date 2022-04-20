import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGesture } from "@use-gesture/react";
import type {
  Handler,
  WebKitGestureEvent,
  SharedGestureState,
  FullGestureState,
} from "@use-gesture/react";

export type OnPanningHandler = Handler<"wheel", WheelEvent>;

export type OnZoomingHandler = Handler<
  "pinch",
  WheelEvent | PointerEvent | TouchEvent | WebKitGestureEvent
>;

export type OnPointerMoveHandler = Handler<"move">;

export type OnDragHandler = Handler<"drag">;

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
  onDrag,
  onDragStart,
  onDragEnd,
  children,
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
  onDrag: OnDragHandler;
  onDragStart: OnDragHandler;
  onDragEnd: OnDragHandler;
  children?: React.ReactNode;
}) {
  const interactionEventTargetRef = useRef();

  const [isSpacebarPressed, setIsSpacebarPressed] = useState(false);
  let platform: PlatformName = "other";
  useEffect(() => {
    platform = getCurrentPlatform(window.navigator);
  });

  useEffect(() => {
    const kd = (e) => {
      // if spacebar is pressed, enable panning wirt dragging.
      if (e.code === "Space") {
        setIsSpacebarPressed(true);
      }
    };
    const ku = (e) => {
      if (e.code === "Space") {
        setIsSpacebarPressed(false);
      }
    };

    document.addEventListener("keydown", kd);
    document.addEventListener("keyup", ku);

    return () => {
      document.removeEventListener("keydown", kd);
      document.removeEventListener("keyup", ku);
    };
  }, []);

  const transform_wheel_to_zoom = (s) => {
    return {
      ...s,
      origin: [s.event.clientX, s.event.clientY],
      delta: [-s.delta[1] * ZOOM_WITH_SCROLL_SENSITIVITY, 0],
    };
  };

  const [first_wheel_event, set_first_wheel_event] =
    useState<FullGestureState<"wheel">>();

  // this is a hack to prevent from onDragStart being called even when no movement is detected.
  const [drag_start_emitted, set_drag_start_emitted] = useState(false);

  useGesture(
    {
      onPinch: onZooming,
      onPinchStart: onZoomingStart,
      onPinchEnd: onZoomingEnd,
      onWheel: (s) => {
        if (s.altKey) {
          // altkey prevents panning the canvas.
          return;
        }
        if (s.ctrlKey) {
          // crtl key is also enabled on onPinch - we don't have to explicitly add linux & windows support for ctrl + scroll.
          return;
        } else {
          // only for mac
          // TODO: on firefox, cmd + scroll resizes the window zoom level. this should be prevented.
          if (s.metaKey && first_wheel_event?.metaKey) {
            onZooming(transform_wheel_to_zoom(s));
            return;
          }
          if (first_wheel_event && first_wheel_event.metaKey) {
            if (
              Math.sign(first_wheel_event.direction[0]) ==
              Math.sign(s.direction[0])
            ) {
              onZooming(transform_wheel_to_zoom(s));
              return;
            } else {
              // direction inverted, setting new state.
              set_first_wheel_event(s);
            }
          }
        }
        onPanning(s);
        s.event.stopPropagation();
        s.event.preventDefault();
      },
      onWheelStart: (s) => {
        set_first_wheel_event(s);
        onPanningStart(s);
        s.event.stopPropagation();
        s.event.preventDefault();
      },
      onWheelEnd: (s) => {
        set_first_wheel_event(undefined);
        onPanningEnd(s);
      },
      onMove: onPointerMove,
      onDragStart: (s) => {
        if (isSpacebarPressed) {
          onPanningStart(s as any);
          return;
        }

        if (s.delta[0] || s.delta[1]) {
          onDragStart(s);
          set_drag_start_emitted(true);
        }
      },
      onDrag: (s) => {
        if (isSpacebarPressed) {
          onPanning({
            ...s,
            delta: [-s.delta[0], -s.delta[1]],
          } as any);
          return;
        }

        if ((s.delta[0] || s.delta[1]) && !drag_start_emitted) {
          set_drag_start_emitted(true);
          onDragStart(s);
        }
        onDrag(s);
      },
      onDragEnd: (s) => {
        if (isSpacebarPressed) {
          onPanningEnd(s as any);
          return;
        }

        set_drag_start_emitted(false);
        onDragEnd(s);
      },
      onMouseDown: onPointerDown,
      onMoveStart: onPointerMoveStart,
      onMoveEnd: onPointerMoveEnd,
    },
    {
      target: interactionEventTargetRef,
      eventOptions: {
        // passive to false to raise `e.preventDefault()` and `e.stopPropagation()`. - this will prevent the browser from scrolling the page, navigating with swipe gesture (safari, firefox).
        passive: false,
      },
      pinch: {},
    }
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "transparent",
        overflow: "hidden",
        touchAction: "none",
        cursor: isSpacebarPressed ? "grab" : "default",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      id="gesture-event-listener"
      ref={interactionEventTargetRef}
    >
      {children}
    </div>
  );
}

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
