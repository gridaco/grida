"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useDocument } from "@/builder/provider";
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
    document: { hovered_node_id, selected_node_id },
    pointerMove,
    pointerDown,
    pointerEnterNode,
    pointerLeaveNode,
  } = useDocument();
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
      pointerMove(event);
    },
    onPointerDown: ({ event }) => {
      pointerDown(event);
    },
  });

  return (
    <div {...bind()} className="absolute inset-0 pointer-events-auto z-50">
      <div className="w-full h-full" id="canvas-overlay-portal" ref={ref}>
        {selected_node_id && <NodeOverlay node_id={selected_node_id} />}
        {hovered_node_id && <NodeOverlay node_id={hovered_node_id} />}
      </div>
    </div>
  );
}

const __rect_fallback = { top: 0, left: 0, width: 0, height: 0 };

function NodeOverlay({ node_id }: { node_id: string }) {
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
  // const bind = useGesture({
  //   onDrag: () => {
  //     console.log("dragging");
  //   },
  // });

  return (
    <div
      // {...bind()}
      className="pointer-events-auto select-none z-10 border-2 border-workbench-accent-sky"
      style={{
        position: "absolute",
        top: top,
        left: left,
        width: width,
        height: height,
      }}
    />
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
