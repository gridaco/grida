import React, { useEffect, useRef, useState } from "react";
import { useGesture } from "@use-gesture/react";
import type {
  Handler,
  WebKitGestureEvent,
  SharedGestureState,
  FullGestureState,
} from "@use-gesture/react";

export type OnPanningHandler = Handler<"wheel", WheelEvent>;

export type OnPanningStartHandler = () => void;

export type OnPanningEndHandler = () => void;

export type OnZoomingHandler = Handler<
  "pinch",
  WheelEvent | PointerEvent | TouchEvent | WebKitGestureEvent
>;

export type OnPointerMoveHandler = Handler<"move">;

export type OnDragHandler = Handler<"drag">;

export type OnPointerDownHandler = (
  e: { event: React.MouseEvent<EventTarget, MouseEvent> } & SharedGestureState
) => void;

export type OnPointerUpHandler = OnPointerDownHandler;

const ZOOM_WITH_SCROLL_SENSITIVITY = 0.001;

export function CanvasEventTarget({
  onZoomToFit,
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
  onPointerUp,
  onDrag,
  onDragStart,
  onDragEnd,
  cursor,
  children,
}: React.PropsWithChildren<
  {
    onZoomToFit?: () => void;
    onPanning: OnPanningHandler;
    onPanningStart: OnPanningStartHandler;
    onPanningEnd: OnPanningEndHandler;
    onZooming: OnZoomingHandler;
    onZoomingStart: OnZoomingHandler;
    onZoomingEnd: OnZoomingHandler;
    onPointerMove: OnPointerMoveHandler;
    onPointerMoveStart: OnPointerMoveHandler;
    onPointerMoveEnd: OnPointerMoveHandler;
    onPointerDown: OnPointerDownHandler;
    onPointerUp: OnPointerUpHandler;
    onDrag: OnDragHandler;
    onDragStart: OnDragHandler;
    onDragEnd: OnDragHandler;
  } & {
    cursor?: React.CSSProperties["cursor"];
  }
>) {
  const interactionEventTargetRef = useRef();

  const [isSpacebarPressed, setIsSpacebarPressed] = useState(false);
  const [isAuxPressed, setIsAuxPressed] = useState(false);

  const panningMetaKeyPressed = isSpacebarPressed || isAuxPressed;

  let platform: PlatformName = "other";
  useEffect(() => {
    platform = getCurrentPlatform(window.navigator);
  });

  useEffect(() => {
    const kd = (e) => {
      // if spacebar is pressed, enable panning with dragging.
      if (e.code === "Space") {
        setIsSpacebarPressed(true);
      }

      // if shift + 0
      else if (e.code === "Digit0" && e.shiftKey) {
        onZoomToFit?.();
      }
    };
    const ku = (e) => {
      // space bar
      if (e.code === "Space") {
        setIsSpacebarPressed(false);
      }
    };
    const md = (e) => {
      // mouse weehl (physical) - as well as space bar, mouse wheel + drag will enable panning.
      if (e.button === 1) {
        setIsAuxPressed(true);
      }
    };

    const mu = (e) => {
      // mouse wheel (physical)
      if (e.button === 1) {
        setIsAuxPressed(false);
      }
    };

    document.addEventListener("keydown", kd);
    document.addEventListener("keyup", ku);
    document.addEventListener("mousedown", md);
    document.addEventListener("mouseup", mu);

    return () => {
      document.removeEventListener("keydown", kd);
      document.removeEventListener("keyup", ku);
      document.removeEventListener("mousedown", md);
      document.removeEventListener("mouseup", mu);
    };
  }, []);

  useEffect(() => {
    if (isAuxPressed) {
      onPanningStart?.();
    } else {
      onPanningEnd?.();
    }
  }, [isAuxPressed]);

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
        onPanningStart();
        s.event.stopPropagation();
        s.event.preventDefault();
      },
      onWheelEnd: (s) => {
        set_first_wheel_event(undefined);
        onPanningEnd();
      },
      onMove: (s) => {
        if (isAuxPressed) {
          // @ts-ignore
          onPanning({
            ...s,
            // reverse delta
            delta: [-s.delta[0], -s.delta[1]],
          });
          return;
        } else {
          onPointerMove(s);
        }
      },
      onDragStart: (s) => {
        if (panningMetaKeyPressed) {
          onPanningStart();
          return;
        }

        if (s.delta[0] || s.delta[1]) {
          onDragStart(s);
          set_drag_start_emitted(true);
        }
      },
      onDrag: (s) => {
        if (panningMetaKeyPressed) {
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
        if (panningMetaKeyPressed) {
          onPanningEnd();
          return;
        }

        set_drag_start_emitted(false);
        onDragEnd(s);
      },
      // @ts-ignore
      onMouseDown: onPointerDown,
      // @ts-ignore
      onPointerUp: onPointerUp,
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
        overflow: "hidden",
        touchAction: "none",
        cursor: panningMetaKeyPressed ? "grab" : cursor,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      id="gesture-event-listener"
      // @ts-ignore
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
