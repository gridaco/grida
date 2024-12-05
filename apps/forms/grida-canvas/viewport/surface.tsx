"use client";

import React, { useContext, useEffect, useRef, useState } from "react";
import { useEventTarget } from "@/grida-canvas";
import { useGesture } from "@use-gesture/react";
import {
  useDocument,
  useEventTargetCSSCursor,
  useNode,
  useNodeAction,
} from "../provider";
import { RotationCursorIcon } from "../components/cursor";
import { grida } from "@/grida";
import { useIsWindowResizing } from "./hooks/window-resizing";
import { supports } from "@/grida/utils/supports";
import { Marquee } from "./ui/marquee";
import { domapi } from "../domapi";
import { LayerOverlay } from "./ui/layer";
import { ViewportSurfaceContext } from "./context";
import {
  useGroupSurfaceTransform,
  useNodeSurfaceTransfrom,
} from "./hooks/transform";
import { cmath } from "../math";
import { useSnapGuide } from "./hooks/snap";

export function EditorSurface() {
  const isWindowResizing = useIsWindowResizing();
  const {
    marquee,
    hovered_node_id,
    selected_node_ids,
    is_node_transforming,
    content_edit_mode,
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
  const context = useContext(ViewportSurfaceContext);

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
        dragStart(event as PointerEvent);
      },
      onDragEnd: ({ event }) => {
        if (event.defaultPrevented) return;
        dragEnd(event as PointerEvent);
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
        // disable drag gesture with arrow keys
        keyboardDisplacement: 0,
      },
    }
  );

  return (
    <div
      {...bind()}
      tabIndex={0}
      className="absolute inset-0 pointer-events-auto will-change-transform z-50"
      style={{
        userSelect: "none",
        touchAction: "none",
        outline: "none",
        cursor: cursor,
      }}
    >
      <div
        data-transforming={is_node_transforming || isWindowResizing}
        className="opacity-0 data-[transforming='true']:opacity-100 transition-colors"
      >
        <SnapGuide />
      </div>
      <div
        data-transforming={is_node_transforming || isWindowResizing}
        className="opacity-100 data-[transforming='true']:opacity-0 transition-colors"
      >
        {content_edit_mode === "text" && selected_node_ids.length === 1 && (
          <SurfaceTextEditor node_id={selected_node_ids[0]} />
        )}
        <div className="w-full h-full" id="canvas-overlay-portal" ref={ref}>
          <SelectionOverlay selection={selected_node_ids} readonly={false} />
          {!marquee &&
            hovered_node_id &&
            !selected_node_ids.includes(hovered_node_id) && (
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
    </div>
  );
}

function SelectionOverlay({
  readonly,
  selection = [],
}: {
  readonly?: boolean;
  selection?: string[];
}) {
  if (!selection || selection.length === 0) {
    return <></>;
  } else if (selection.length === 1) {
    return <NodeOverlay node_id={selection[0]} readonly={readonly} />;
  } else {
    return <GroupOverlay node_ids={selection} readonly={readonly} />;
  }
}

function GroupOverlay({
  node_ids,
  readonly,
}: {
  node_ids: string[];
  readonly?: boolean;
}) {
  const { layerDragStart, layerDragEnd, layerDrag, layerClick } =
    useEventTarget();
  const transform = useGroupSurfaceTransform(...node_ids);

  // as there is no native way to prevent onclick from triggering after drag, this is a trick to prevent it.
  // resetting this will be delayed by 100ms (on drag end)
  const wasDragging = useRef(false);

  const bind = useGesture(
    {
      onPointerDown: (e) => {
        e.event.stopPropagation();
      },
      onDragStart: (e) => {
        e.event.stopPropagation();
        layerDragStart(node_ids, e);
      },
      onDragEnd: (e) => {
        e.event.stopPropagation();
        layerDragEnd(node_ids, e);
        setTimeout(() => {
          wasDragging.current = false;
        }, 100);
      },
      onDrag: (e) => {
        if (e.distance[0] > 0 || e.distance[1] > 0) {
          wasDragging.current = true;
        }
        e.event.stopPropagation();
        layerDrag(node_ids, e);
      },
      onClick: (e) => {
        e.event.stopPropagation();
        if (wasDragging.current) {
          return;
        }
        layerClick(node_ids, e.event);
      },
    },
    {
      drag: {
        threshold: 5,
        // disable drag gesture with arrow keys
        keyboardDisplacement: 0,
      },
    }
  );

  return (
    <>
      <LayerOverlay
        {...bind()}
        readonly={readonly}
        transform={transform}
        zIndex={10}
      />
      {
        // also hightlight the included nodes
        node_ids.map((node_id) => (
          <NodeOverlay key={node_id} node_id={node_id} readonly zIndex={20} />
        ))
      }
    </>
  );
}

function NodeOverlay({
  node_id,
  readonly,
  zIndex,
}: {
  node_id: string;
  readonly?: boolean;
  zIndex?: number;
}) {
  const { layerDragStart, layerDragEnd, layerDrag } = useEventTarget();
  const transform = useNodeSurfaceTransfrom(node_id);
  const node = useNode(node_id);

  const { is_component_consumer } = node.meta;
  readonly = readonly || is_component_consumer;

  const bind = useGesture(
    {
      onDragStart: (e) => {
        e.event.stopPropagation();
        layerDragStart([node_id], e);
      },
      onDragEnd: (e) => {
        e.event.stopPropagation();
        layerDragEnd([node_id], e);
      },
      onDrag: (e) => {
        e.event.stopPropagation();
        layerDrag([node_id], e);
      },
    },
    {
      drag: {
        threshold: 5,
        // disable drag gesture with arrow keys
        keyboardDisplacement: 0,
      },
    }
  );

  return (
    <LayerOverlay
      {...bind()}
      readonly={readonly}
      transform={transform}
      zIndex={zIndex}
      isComponentConsumer={is_component_consumer}
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
          <LayerOverlayResizeHandle
            anchor="se"
            readonly={readonly}
            node_id={node_id}
          />
          {supports.cornerRadius(node.type) &&
            !supports.children(node.type) && (
              <NodeOverlayCornerRadiusHandle anchor="se" node_id={node_id} />
            )}
          <LayerOverlayRotationHandle anchor="ne" node_id={node_id} />
        </>
      )}
    </LayerOverlay>
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

function LayerOverlayRotationHandle({
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
      className="flex items-center justify-center"
      style={{
        background: "transparent",
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

function LayerOverlayResizeHandle({
  node_id,
  anchor,
  readonly,
  size = 8,
}: {
  node_id: string;
  anchor: "nw" | "ne" | "sw" | "se";
  readonly?: boolean;
  size?: number;
}) {
  const { dragResizeHandleStart, dragResizeHandleEnd, dragResizeHandle } =
    useEventTarget();

  const bind = useGesture(
    {
      onDragStart: (e) => {
        e.event.stopPropagation();
        const rect = domapi.get_node_element(node_id)?.getBoundingClientRect();
        if (!rect) return;

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

function SnapGuide() {
  const guide = useSnapGuide();

  if (!guide) return <></>;

  return (
    <div className="">
      {/* <pre className="absolute bottom-0 left-0 text-xs bg-foreground text-background z-50">
        {JSON.stringify({ snaps: snap }, null, 2)}
      </pre> */}
      {guide.x?.map((snap, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              position: "absolute",
              left: snap.left,
              top: snap.top,
              transform: "translate(-50%, -50%)",
              // background: "red",
            }}
          >
            <Crosshair />
          </div>
          <Rule axis="y" offset={snap.left} />
        </React.Fragment>
      ))}
      {guide.y?.map((snap, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              position: "absolute",
              left: snap.left,
              top: snap.top,
              transform: "translate(-50%, -50%)",
              // background: "red",
            }}
          >
            <Crosshair />
          </div>
          <Rule axis="x" offset={snap.top} />
        </React.Fragment>
      ))}
    </div>
  );
}

function Crosshair() {
  return (
    <div style={{ position: "relative", width: 5, height: 5 }}>
      {/* Diagonal line from top-left to bottom-right */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: 0.5,
          backgroundColor: "red",
          transform: "rotate(45deg)",
          top: "50%",
          left: "0",
          transformOrigin: "center",
        }}
      />

      {/* Diagonal line from top-right to bottom-left */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: 0.5,
          backgroundColor: "red",
          transform: "rotate(-45deg)",
          top: "50%",
          left: "0",
          transformOrigin: "center",
        }}
      />
    </div>
  );
}

function Rule({
  axis,
  offset,
  width = 0.1,
}: {
  axis: "x" | "y";
  offset: number;
  width?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        transform:
          axis === "x" ? `translateY(${offset}px)` : `translateX(${offset}px)`,
        width: axis === "x" ? "100%" : width,
        height: axis === "y" ? "100%" : width,
        background: "red",
      }}
    />
  );
}
