"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEventTarget } from "@/builder";
import { useGesture } from "@use-gesture/react";
import { useDocument, useNode, useNodeDomElement } from "../provider";
import { RotationCursorIcon } from "../components/cursor";
import { CANVAS_EVENT_TARGET_ID } from "../k/id";

interface CanvasEventTargetContext {
  portal?: HTMLDivElement | null;
  setPortalRef?: (ref: HTMLDivElement | null) => void;
}

const EventTargetContext = createContext<CanvasEventTargetContext | null>(null);

export function CanvasEventTarget({
  className,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "id" | "style">) {
  const [overlay, setOverlayRef] = React.useState<HTMLDivElement | null>(null);

  return (
    <EventTargetContext.Provider
      value={{ portal: overlay, setPortalRef: setOverlayRef }}
    >
      <div
        {...props}
        id={CANVAS_EVENT_TARGET_ID}
        className={className}
        style={{ pointerEvents: "auto" }}
      >
        {children}
      </div>
    </EventTargetContext.Provider>
  );
}

export function CanvasOverlay() {
  const {
    marquee,
    cursor,
    hovered_node_id,
    selected_node_id,
    is_node_transforming,
    content_edit_mode,
    keyDown,
    pointerMove,
    pointerDown,
    pointerUp,
    drag,
    dragStart,
    dragEnd,
    tryEnterContentEditMode,
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

  const bind = useGesture(
    {
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
      // onDoubleClick: (e) => {
      //   tryEnterContentEditMode();
      // },
      onDragStart: (e) => {
        dragStart();
      },
      onDragEnd: (e) => {
        dragEnd();
      },
      onDrag: (e) => {
        // console.log("drag", e.delta, e.distance);
        drag({ delta: e.delta, distance: e.distance });
      },
    },
    {
      move: {
        threshold: 2,
      },
      drag: {
        threshold: 5,
      },
    }
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Prevent conflicts with other input elements
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // console.log("keydown", event.key);

      keyDown(event);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [keyDown]);

  return (
    <div
      data-transforming={is_node_transforming}
      {...bind()}
      tabIndex={0}
      className="absolute inset-0 pointer-events-auto will-change-transform z-50 opacity-100 data-[transforming='true']:opacity-0 transition-colors "
      style={{
        userSelect: "none",
        touchAction: "none",
        outline: "none",
        cursor: cursor,
      }}
    >
      {content_edit_mode === "text" && <RichTextEditorSurface />}
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
        <div id="marquee-container" className="absolute top-0 left-0 w-0 h-0">
          {marquee && (
            <Marquee
              x1={marquee.x1}
              y1={marquee.y1}
              x2={marquee.x2}
              y2={marquee.y2}
            />
          )}
        </div>
      </div>
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

function Marquee({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  return (
    <div
      className="absolute border border-workbench-accent-sky bg-workbench-accent-sky/20 pointer-events-none"
      style={{
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      }}
    />
  );
}

function NodeOverlay({
  node_id,
  readonly,
}: {
  node_id: string;
  readonly: boolean;
}) {
  const __rect_fallback = useMemo(() => new DOMRect(0, 0, 0, 0), []);

  const { getNodeAbsoluteRotation } = useDocument();
  const node = useNode(node_id);
  const portal = useCanvasOverlayPortal();
  const node_element = useNodeDomElement(node_id);
  const { rotation: node_rotation } = node;
  const portal_rect = portal?.getBoundingClientRect() ?? __rect_fallback;
  const node_element_bounding_rect =
    node_element?.getBoundingClientRect() ?? __rect_fallback;

  // Calculate the center position relative to the portal
  const centerX =
    node_element_bounding_rect.left +
    node_element_bounding_rect.width / 2 -
    portal_rect.left;
  const centerY =
    node_element_bounding_rect.top +
    node_element_bounding_rect.height / 2 -
    portal_rect.top;

  // Calculate the position of the target relative to the portal
  const width = node_element?.clientWidth;
  const height = node_element?.clientHeight;

  // absolute rotation => accumulated rotation to the root
  const absolute_rotation = getNodeAbsoluteRotation(node_id);

  return (
    <div
      className="group pointer-events-auto select-none border-2 border-workbench-accent-sky relative"
      style={{
        position: "absolute",
        top: centerY,
        left: centerX,
        transform: `translate(-50%, -50%) rotate(${absolute_rotation ?? 0}deg)`,
        width: width,
        height: height,
        zIndex: readonly ? 1 : 2,
        touchAction: "none",
        willChange: "transform",
      }}
    >
      {!readonly && (
        <>
          {/* top left */}
          {/* <ResizeHandle anchor="nw" readonly={readonly} node_id={node_id} /> */}
          {/* top right */}
          {/* <ResizeHandle anchor="ne" readonly={readonly} node_id={node_id} /> */}
          {/* bottom left */}
          {/* <ResizeHandle anchor="sw" readonly={readonly} node_id={node_id} /> */}
          {/* bottom right */}
          <ResizeHandle anchor="se" readonly={readonly} node_id={node_id} />
          {node.type === "rectangle" && (
            <CornerRadiusHandle anchor="se" node_id={node_id} />
          )}
          <RotationHandle anchor="ne" node_id={node_id} />
        </>
      )}
    </div>
  );
}

function CornerRadiusHandle({
  node_id,
  anchor,
  size = 8,
  margin = 16,
}: {
  node_id: string;
  anchor: "nw" | "ne" | "sw" | "se";
  margin?: number;
  size?: number;
}) {
  const {
    dragCornerRadiusHandleStart,
    dragCornerRadiusHandleEnd,
    dragCornerRadiusHandle,
  } = useEventTarget();

  const bind = useGesture(
    {
      onDragStart: (e) => {
        e.event.stopPropagation();
        dragCornerRadiusHandleStart(node_id);
      },
      onDragEnd: (e) => {
        e.event.stopPropagation();
        dragCornerRadiusHandleEnd(node_id);
      },
      onDrag: (e) => {
        e.event.stopPropagation();
        dragCornerRadiusHandle(node_id, anchor, {
          delta: e.delta,
          distance: e.distance,
        });
      },
    },
    {
      eventOptions: {
        passive: false,
        capture: true,
      },
    }
  );

  const node = useNode(node_id);

  // TODO: resolve by anchor
  const radii = typeof node.cornerRadius === "number" ? node.cornerRadius : 0;

  const minmargin = Math.max(radii + size, margin);

  return (
    <div
      {...bind()}
      className="hidden group-hover:block border rounded-full bg-white border-workbench-accent-sky absolute z-10 pointer-events-auto"
      style={{
        top: anchor[0] === "n" ? minmargin : "auto",
        bottom: anchor[0] === "s" ? minmargin : "auto",
        left: anchor[1] === "w" ? minmargin : "auto",
        right: anchor[1] === "e" ? minmargin : "auto",
        width: size,
        height: size,
        transform: `translate(${anchor[1] === "w" ? "-50%" : "50%"}, ${anchor[0] === "n" ? "-50%" : "50%"})`,
        cursor: "pointer",
        touchAction: "none",
      }}
    />
  );
}

function RotationHandle({
  node_id,
  anchor,
  offset = 8,
  size = 16,
}: {
  node_id: string;
  anchor: "nw" | "ne" | "sw" | "se";
  offset?: number;
  size?: number;
}) {
  const { dragRotationHandleStart, dragRotationHandle, dragRotationHandleEnd } =
    useEventTarget();

  const bind = useGesture(
    {
      onDragStart: (e) => {
        e.event.stopPropagation();
        dragRotationHandleStart(node_id);
      },
      onDragEnd: (e) => {
        e.event.stopPropagation();
        dragRotationHandleEnd(node_id);
      },
      onDrag: (e) => {
        e.event.stopPropagation();
        dragRotationHandle(node_id, anchor, {
          delta: e.delta,
          distance: e.distance,
        });
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
      className="bg-transparent flex items-center justify-center"
      style={{
        position: "absolute",
        top: anchor[0] === "n" ? -offset : "auto",
        bottom: anchor[0] === "s" ? -offset : "auto",
        left: anchor[1] === "w" ? -offset : "auto",
        right: anchor[1] === "e" ? -offset : "auto",
        width: size,
        height: size,
        transform: `translate(${anchor[1] === "w" ? "-50%" : "50%"}, ${anchor[0] === "n" ? "-50%" : "50%"})`,
        cursor: "pointer",
        touchAction: "none",
      }}
    >
      <RotationCursorIcon />
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
        dragResizeHandle(node_id, anchor, {
          delta: e.delta,
          distance: e.distance,
        });
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
        touchAction: "none",
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

function RichTextEditorSurface() {
  const { selectedNode, selected_node_id } = useDocument();
  const node = useNode(selected_node_id!);

  // const [content, setContent] = useState("Edit this text");

  // const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
  //   console.log("text content", e);
  //   // @ts-ignore
  //   setContent(e.target.innerText);
  // };

  return (
    <div
      id="richtext-editor-surface"
      className="absolute inset-0 z-10 bg-red-500/25"
    >
      <textarea
        autoFocus
        // TODO: only supports literal text value
        value={node.text as string}
        onChange={(e) => {
          selectedNode?.text(e.target.value);
        }}
        className="appearance-none bg-transparent border-none outline-none"
      />
      {/* <div
        autoFocus
        // onInput={handleInput}
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        className="outline-none border-none"
      /> */}
    </div>
  );
}
