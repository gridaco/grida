"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEventTarget } from "@/grida-canvas";
import { useGesture } from "@use-gesture/react";
import {
  useDocument,
  useEventTargetCSSCursor,
  useNode,
  useNodeAction,
  useNodeDomElement,
} from "../provider";
import { RotationCursorIcon } from "../components/cursor";
import { grida } from "@/grida";
import assert from "assert";
import { useIsWindowResizing } from "./hooks/window-resizing";
import { supports } from "@/grida/utils/supports";
import { Marquee } from "./ui/marquee";
import { domapi } from "../domapi";

interface CanvasEventTargetContext {
  portal?: HTMLDivElement | null;
  setPortalRef?: (ref: HTMLDivElement | null) => void;
}

const EventTargetContext = createContext<CanvasEventTargetContext | null>(null);

export function ViewportRoot({
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
        id={domapi.k.VIEWPORT_ELEMENT_ID}
        className={className}
        style={{ pointerEvents: "auto", overflow: "hidden" }}
      >
        {children}
      </div>
    </EventTargetContext.Provider>
  );
}

export function ViewportSurface() {
  const isWindowResizing = useIsWindowResizing();
  const {
    marquee,
    hovered_node_id,
    selected_node_id,
    is_node_transforming,
    content_edit_mode,
    keyDown,
    keyUp,
    pointerMove,
    pointerDown,
    pointerUp,
    click,
    drag,
    dragStart,
    dragEnd,
    tryEnterContentEditMode,
  } = useEventTarget();
  const cursor = useEventTargetCSSCursor();
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
        if (event.defaultPrevented) return;
        // for performance reasons, we don't want to update the overlay when transforming
        if (is_node_transforming) return;
        pointerMove(event);
      },
      onPointerDown: ({ event }) => {
        if (event.defaultPrevented) return;
        if (content_edit_mode === "text") return;
        pointerDown(event);
      },
      onPointerUp: ({ event }) => {
        if (event.defaultPrevented) return;
        if (content_edit_mode === "text") return;
        pointerUp(event);
      },
      onClick: ({ event }) => {
        click(event);
      },
      onDoubleClick: ({ event }) => {
        if (event.defaultPrevented) return;
        tryEnterContentEditMode();
      },
      onDragStart: ({ event }) => {
        if (event.defaultPrevented) return;
        dragStart();
      },
      onDragEnd: ({ event }) => {
        if (event.defaultPrevented) return;
        dragEnd();
      },
      onDrag: (e) => {
        if (e.event.defaultPrevented) return;
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
    const shouldIgnore = (event: KeyboardEvent) => {
      // Prevent conflicts with other input elements
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return true;
      }
      return false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Prevent conflicts with other input elements
      if (shouldIgnore(event)) {
        return;
      }
      // console.log("keydown", event.key);
      keyDown(event);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (shouldIgnore(event)) {
        return;
      }

      keyUp(event);
      // console.log("keyup", event.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [keyDown]);

  return (
    <div
      data-transforming={is_node_transforming || isWindowResizing}
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
      {content_edit_mode === "text" && selected_node_id && (
        <SurfaceTextEditor node_id={selected_node_id} />
      )}
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

export function useViewportSurfacePortal() {
  const context = useContext(EventTargetContext);
  if (!context) {
    throw new Error(
      "useCanvasOverlay must be used within a CanvasEventTarget."
    );
  }
  return context.portal;
}

/**
 * returns the relative transform of the node surface relative to the portal
 */
function useNodeSurfaceTransfrom_v1(node_id: string) {
  const __rect_fallback = useMemo(() => new DOMRect(0, 0, 0, 0), []);
  const { getNodeAbsoluteRotation } = useDocument();
  const portal = useViewportSurfacePortal();
  const node_element = useNodeDomElement(node_id);
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

  return {
    top: centerY,
    left: centerX,
    transform: `translate(-50%, -50%) rotate(${absolute_rotation ?? 0}deg)`,
    width: width,
    height: height,
  };
}

/**
 * returns the relative transform of the node surface relative to the portal
 * TODO: Not tested with the performance
 */
function useNodeSurfaceTransfrom(node_id: string) {
  const __rect_fallback = useMemo(() => new DOMRect(0, 0, 0, 0), []);
  const { getNodeAbsoluteRotation } = useDocument();
  const portal = useViewportSurfacePortal();
  const node_element = useNodeDomElement(node_id);

  const [transform, setTransform] = useState({
    top: 0,
    left: 0,
    transform: "",
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (!node_element || !portal) return;

    const updateTransform = () => {
      const portal_rect = portal.getBoundingClientRect();
      const node_element_bounding_rect =
        node_element.getBoundingClientRect() ?? __rect_fallback;

      const centerX =
        node_element_bounding_rect.left +
        node_element_bounding_rect.width / 2 -
        portal_rect.left;
      const centerY =
        node_element_bounding_rect.top +
        node_element_bounding_rect.height / 2 -
        portal_rect.top;

      const width = node_element.clientWidth;
      const height = node_element.clientHeight;

      const absolute_rotation = getNodeAbsoluteRotation(node_id);

      setTransform({
        top: centerY,
        left: centerX,
        transform: `translate(-50%, -50%) rotate(${absolute_rotation ?? 0}deg)`,
        width: width,
        height: height,
      });
    };

    // Observe size changes
    const resizeObserver = new ResizeObserver(() => updateTransform());
    resizeObserver.observe(node_element);

    // Trigger initial update
    updateTransform();

    return () => {
      resizeObserver.disconnect();
    };
  }, [node_element, portal, getNodeAbsoluteRotation, node_id, __rect_fallback]);

  return transform;
}

function NodeOverlay({
  node_id,
  readonly,
}: {
  node_id: string;
  readonly: boolean;
}) {
  const transform = useNodeSurfaceTransfrom(node_id);
  const node = useNode(node_id);

  return (
    <div
      data-node-is-runtime-instance={node.meta.is_component_consumer}
      className="relative group pointer-events-auto select-none border-2 border-workbench-accent-sky data-[node-is-runtime-instance='true']:border-workbench-accent-violet"
      style={{
        position: "absolute",
        ...transform,
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
          <NodeOverlayResizeHandle
            anchor="se"
            readonly={readonly}
            node_id={node_id}
          />
          {supports.cornerRadius(node.type) &&
            !supports.children(node.type) && (
              <NodeOverlayCornerRadiusHandle anchor="se" node_id={node_id} />
            )}
          <NodeOverlayRotationHandle anchor="ne" node_id={node_id} />
        </>
      )}
    </div>
  );
}

function NodeOverlayCornerRadiusHandle({
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

function NodeOverlayRotationHandle({
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

function NodeOverlayResizeHandle({
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

function SurfaceTextEditor({ node_id }: { node_id: string }) {
  const inputref = useRef<HTMLTextAreaElement>(null);
  const change = useNodeAction(node_id)!;
  const transform = useNodeSurfaceTransfrom(node_id);
  const node = useNode(node_id!);
  const { tryExitContentEditMode } = useEventTarget();

  useEffect(() => {
    // select all text
    if (inputref.current) {
      inputref.current.select();
    }
  }, [inputref.current]);

  const stopPropagation = (e: React.BaseSyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      id="richtext-editor-surface"
      className="fixed left-0 top-0 w-0 h-0 z-10"
    >
      <div
        style={{
          position: "absolute",
          ...transform,
          willChange: "transform",
          overflow: "hidden",
          resize: "none",
          zIndex: 1,
        }}
      >
        {/* <div
          autoFocus
          // onInput={handleInput}
          tabIndex={0}
          contentEditable
          suppressContentEditableWarning
          className="appearance-none bg-transparent border-none outline-none p-0 m-0"
        /> */}
        <textarea
          ref={inputref}
          // TODO: only supports literal text value
          onPointerDown={stopPropagation}
          value={node.text as string}
          maxLength={node.maxLength}
          onBlur={tryExitContentEditMode}
          onKeyDown={(e) => {
            stopPropagation(e);
            if (e.key === "Escape") {
              inputref.current?.blur();
            }
          }}
          onChange={(e) => {
            change.text(e.target.value);
          }}
          className="m-0 p-0 border-none outline-none appearance-none bg-transparent h-full overflow-visible"
          style={{
            width: "calc(100% + 1px)",
            ...grida.program.css.toReactTextStyle(
              node as grida.program.nodes.TextNode
            ),
          }}
        />
      </div>
    </div>
  );
}
