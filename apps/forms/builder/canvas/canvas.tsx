"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useEventTarget } from "@/builder";
import { useGesture } from "@use-gesture/react";
import { grida } from "@/grida";

interface CanvasEventTargetContext {
  portal?: HTMLDivElement | null;
  setPortalRef?: (ref: HTMLDivElement | null) => void;
}

const EventTargetContext = createContext<CanvasEventTargetContext | null>(null);

export function CanvasEventTarget({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  const [overlay, setOverlayRef] = React.useState<HTMLDivElement | null>(null);

  return (
    <EventTargetContext.Provider
      value={{ portal: overlay, setPortalRef: setOverlayRef }}
    >
      <div className={className} style={{ pointerEvents: "auto" }}>
        {children}
      </div>
    </EventTargetContext.Provider>
  );
}

export function CanvasOverlay() {
  const {
    hovered_node_id,
    selected_node_id,
    is_node_transforming,
    pointerMove,
    pointerDown,
  } = useEventTarget();
  const ref = useRef<HTMLDivElement>(null);
  const context = useContext(EventTargetContext);

  useEffect(() => {
    if (context?.setPortalRef) {
      context.setPortalRef(ref.current);
    }

    // Clean up when component unmounts
    return () => {
      if (context?.setPortalRef) {
        context.setPortalRef(null);
      }
    };
  }, [context]);

  const bind = useGesture({
    onPointerMove: ({ event }) => {
      // for performance reasons, we don't want to update the overlay when transforming
      if (is_node_transforming) return;
      pointerMove(event);
    },
    onPointerDown: ({ event }) => {
      pointerDown(event);
    },
  });

  return (
    <div
      data-transforming={is_node_transforming}
      {...bind()}
      className="absolute inset-0 pointer-events-auto will-change-transform z-50 opacity-100 data-[transforming='true']:opacity-0 transition-colors "
    >
      <div className="w-full h-full" id="canvas-overlay-portal" ref={ref}>
        {selected_node_id && (
          <NodeOverlay
            node_id={selected_node_id}
            // TODO: based on positioning model
            readonly={false}
          />
        )}
        {hovered_node_id && hovered_node_id !== selected_node_id && (
          <NodeOverlay node_id={hovered_node_id} readonly />
        )}
      </div>
    </div>
  );
}

const __rect_fallback = { top: 0, left: 0, width: 0, height: 0 };

function NodeOverlay({
  node_id,
  readonly,
}: {
  node_id: string;
  readonly: boolean;
}) {
  const {
    hovered_node_id,
    selected_node_id,
    dragNodeOverlayStart,
    dragNodeOverlayEnd,
    dragNodeOverlay,
  } = useEventTarget();

  const portal = useCanvasOverlayPortal();
  const node_element = useMemo(() => {
    return document.getElementById(node_id);
  }, [node_id]);

  const portal_rect = portal?.getBoundingClientRect() ?? __rect_fallback;
  const node_element_rect =
    node_element?.getBoundingClientRect() ?? __rect_fallback;

  // Calculate the position of the target relative to the portal
  const top = node_element_rect.top - portal_rect.top;
  const left = node_element_rect.left - portal_rect.left;
  const width = node_element_rect.width;
  const height = node_element_rect.height;

  //
  const bind = useGesture({
    onDragStart: (e) => {
      dragNodeOverlayStart(node_id);
    },
    onDragEnd: (e) => {
      dragNodeOverlayEnd(node_id);
    },
    onDrag: (e) => {
      console.log("dragging", e);
      dragNodeOverlay(node_id, e.delta);
    },
  });

  return (
    <div
      {...bind()}
      className="pointer-events-auto select-none z-10 border-2 border-workbench-accent-sky relative"
      style={{
        position: "absolute",
        top: top,
        left: left,
        width: width,
        height: height,
      }}
    >
      {!readonly && (
        <>
          {/* top left */}
          <div
            className="border bg-white border-workbench-accent-sky absolute top-0 left-0 z-10 pointer-events-auto"
            style={{
              width: 8,
              height: 8,
              transform: "translate(-50%, -50%)",
              cursor: readonly ? "default" : "nwse-resize",
            }}
          />
          {/* top right */}
          <div
            className="border bg-white border-workbench-accent-sky absolute top-0 right-0 z-10 pointer-events-auto"
            style={{
              width: 8,
              height: 8,
              transform: "translate(50%, -50%)",
              cursor: readonly ? "default" : "nesw-resize",
            }}
          />
          {/* bottom left */}
          <div
            className="border bg-white border-workbench-accent-sky absolute bottom-0 left-0 z-10 pointer-events-auto"
            style={{
              width: 8,
              height: 8,
              transform: "translate(-50%, 50%)",
              cursor: readonly ? "default" : "nesw-resize",
            }}
          />
          {/* bottom right */}
          <div
            className="border bg-white border-workbench-accent-sky absolute bottom-0 right-0 z-10 pointer-events-auto"
            style={{
              width: 8,
              height: 8,
              transform: "translate(50%, 50%)",
              cursor: readonly ? "default" : "nwse-resize",
            }}
          />
        </>
      )}
    </div>
  );
}

export function useCanvasOverlayPortal() {
  const context = useContext(EventTargetContext);
  if (!context) {
    throw new Error(
      "useCanvasOverlay must be used within a CanvasEventTarget."
    );
  }
  return context.portal;
}
