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
import { useNodeDomElement } from "../provider";

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
    pointerUp,
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
    onPointerUp: ({ event }) => {
      pointerUp(event);
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
  const node_element = useNodeDomElement(node_id);

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
      dragNodeOverlay(node_id, e.delta);
    },
  });

  return (
    <div
      {...bind()}
      className="pointer-events-auto select-none border-2 border-workbench-accent-sky relative"
      style={{
        position: "absolute",
        top: top,
        left: left,
        width: width,
        height: height,
        zIndex: readonly ? 1 : 2,
      }}
    >
      {!readonly && (
        <>
          {/* top left */}
          <ResizeHandle anchor="nw" readonly={readonly} node_id={node_id} />
          {/* top right */}
          <ResizeHandle anchor="ne" readonly={readonly} node_id={node_id} />
          {/* bottom left */}
          <ResizeHandle anchor="sw" readonly={readonly} node_id={node_id} />
          {/* bottom right */}
          <ResizeHandle anchor="se" readonly={readonly} node_id={node_id} />
        </>
      )}
    </div>
  );
}

function ResizeHandle({
  node_id,
  anchor,
  readonly,
  size = 8,
}: {
  node_id: string;
  anchor: "nw" | "ne" | "sw" | "se";
  readonly: boolean;
  size?: number;
}) {
  const { dragResizeHandleStart, dragResizeHandleEnd, dragResizeHandle } =
    useEventTarget();

  const node_element = useNodeDomElement(node_id);

  const bind = useGesture(
    {
      onDragStart: (e) => {
        e.event.stopPropagation();
        if (!node_element) return;
        const rect = node_element.getBoundingClientRect();

        dragResizeHandleStart(node_id, {
          width: rect.width,
          height: rect.height,
        });
      },
      onDragEnd: (e) => {
        e.event.stopPropagation();
        dragResizeHandleEnd(node_id);
      },
      onDrag: (e) => {
        e.event.stopPropagation();
        dragResizeHandle(node_id, anchor, e.delta);
      },
    },
    {
      eventOptions: {
        passive: false,
        capture: true,
      },
    }
  );

  return (
    <div
      {...bind()}
      className="border bg-white border-workbench-accent-sky absolute z-10 pointer-events-auto"
      style={{
        top: anchor[0] === "n" ? 0 : "auto",
        bottom: anchor[0] === "s" ? 0 : "auto",
        left: anchor[1] === "w" ? 0 : "auto",
        right: anchor[1] === "e" ? 0 : "auto",
        width: size,
        height: size,
        transform: `translate(${anchor[1] === "w" ? "-50%" : "50%"}, ${anchor[0] === "n" ? "-50%" : "50%"})`,
        cursor: readonly ? "default" : __resize_handle_cursor_map[anchor],
      }}
    />
  );
}

const __resize_handle_cursor_map = {
  nw: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  se: "nwse-resize",
};

export function useCanvasOverlayPortal() {
  const context = useContext(EventTargetContext);
  if (!context) {
    throw new Error(
      "useCanvasOverlay must be used within a CanvasEventTarget."
    );
  }
  return context.portal;
}
