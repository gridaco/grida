"use client";

import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useEventTarget } from "@/grida-canvas";
import { useGesture } from "@use-gesture/react";
import {
  useDocument,
  useEventTargetCSSCursor,
  useNode,
  useNodeAction,
} from "../provider";
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
import { useMeasurement, useSnapGuide } from "./hooks/__tmp";
import { Crosshair } from "./ui/crosshair";
import { MeasurementGuide } from "./ui/measurement";
import { Knob } from "./ui/knob";
import { ColumnsIcon, RowsIcon } from "@radix-ui/react-icons";
import { cmath } from "../cmath";
import { cursors } from "../components/cursor";

export function EditorSurface() {
  const isWindowResizing = useIsWindowResizing();
  const {
    marquee,
    hovered_node_id,
    selection,
    is_node_transforming,
    is_node_translating,
    content_edit_mode,
    pointerMove,
    pointerDown,
    pointerUp,
    click,
    doubleClick,
    drag,
    dragStart,
    dragEnd,
    tryEnterContentEditMode,
  } = useEventTarget();
  const cursor = useEventTargetCSSCursor();
  const ref = useRef<HTMLDivElement>(null);
  const context = useContext(ViewportSurfaceContext);

  // double click triggers when drag ends (if double pointer down) - it might be a better idea to prevent it with the displacement, not by delayed flag
  const should_prevent_double_click = useRef(false);

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
      onDoubleClick: (e) => {
        if (should_prevent_double_click.current) {
          return;
        }
        const { event } = e;
        if (event.defaultPrevented) return;

        // [order matters] - otherwise, it will always try to enter the content edit mode
        tryEnterContentEditMode(); // 1
        doubleClick(event); // 2
      },
      onDragStart: ({ event }) => {
        if (event.defaultPrevented) return;
        dragStart(event as PointerEvent);
        should_prevent_double_click.current = true;
      },
      onDragEnd: (e) => {
        const { event } = e;
        if (event.defaultPrevented) return;
        dragEnd(event as PointerEvent);
        event.stopPropagation();
        setTimeout(() => {
          should_prevent_double_click.current = false;
        }, 100);
      },
      onDrag: (e) => {
        if (e.event.defaultPrevented) return;
        drag({
          delta: e.delta,
          distance: e.distance,
          movement: e.movement,
          initial: e.initial,
          xy: e.xy,
        });
      },
    },
    {
      move: {
        threshold: 2,
      },
      drag: {
        delay: 100,
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
      <MeasurementGuide />
      <div
        data-transforming={is_node_transforming}
        className="opacity-0 data-[transforming='true']:opacity-100 transition-colors"
      >
        <SnapGuide />
      </div>
      <div
        data-ux-hidden={is_node_translating || isWindowResizing}
        className="opacity-100 data-[ux-hidden='true']:opacity-0 transition-colors"
      >
        {content_edit_mode === "text" && selection.length === 1 && (
          <SurfaceTextEditor node_id={selection[0]} />
        )}
        <div className="w-full h-full" id="canvas-overlay-portal" ref={ref}>
          <SelectionOverlay selection={selection} readonly={false} />
          {!marquee &&
            hovered_node_id &&
            !selection.includes(hovered_node_id) && (
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
    return <GroupOverlay selection={selection} readonly={readonly} />;
  }
}

function GroupOverlay({
  selection,
  readonly,
}: {
  selection: string[];
  readonly?: boolean;
}) {
  const { layerDragStart, layerDragEnd, layerDrag, layerClick } =
    useEventTarget();
  const transform = useGroupSurfaceTransform(...selection);

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
        layerDragStart(selection, e);
      },
      onDragEnd: (e) => {
        e.event.stopPropagation();
        layerDragEnd(selection, e);
        setTimeout(() => {
          wasDragging.current = false;
        }, 100);
      },
      onDrag: (e) => {
        if (e.distance[0] > 0 || e.distance[1] > 0) {
          wasDragging.current = true;
        }
        e.event.stopPropagation();
        layerDrag(selection, e);
      },
      onClick: (e) => {
        e.event.stopPropagation();
        if (wasDragging.current) {
          return;
        }
        layerClick(selection, e.event);
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
      >
        <LayerOverlayResizeHandle anchor="n" selection={selection} />
        <LayerOverlayResizeHandle anchor="s" selection={selection} />
        <LayerOverlayResizeHandle anchor="e" selection={selection} />
        <LayerOverlayResizeHandle anchor="w" selection={selection} />
        <LayerOverlayResizeHandle anchor="nw" selection={selection} />
        <LayerOverlayResizeHandle anchor="ne" selection={selection} />
        <LayerOverlayResizeHandle anchor="sw" selection={selection} />
        <LayerOverlayResizeHandle anchor="se" selection={selection} />
        {/*  */}
        <DistributeButton />
      </LayerOverlay>
      {
        // also hightlight the included nodes
        selection.map((node_id) => (
          <NodeOverlay key={node_id} node_id={node_id} readonly zIndex={1} />
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
      onPointerDown: (e) => {
        if (!e.shiftKey) {
          e.event.stopPropagation();
        }
      },
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
          {node.type === "line" ? (
            <>
              <LayerOverlayResizeHandle anchor="e" selection={node_id} />
              <LayerOverlayResizeHandle anchor="w" selection={node_id} />
            </>
          ) : (
            <>
              <LayerOverlayResizeHandle anchor="n" selection={node_id} />
              <LayerOverlayResizeHandle anchor="s" selection={node_id} />
              <LayerOverlayResizeHandle anchor="e" selection={node_id} />
              <LayerOverlayResizeHandle anchor="w" selection={node_id} />
              <LayerOverlayResizeHandle anchor="nw" selection={node_id} />
              <LayerOverlayResizeHandle anchor="ne" selection={node_id} />
              <LayerOverlayResizeHandle anchor="sw" selection={node_id} />
              <LayerOverlayResizeHandle anchor="se" selection={node_id} />
            </>
          )}
          {supports.cornerRadius(node.type) &&
            !supports.children(node.type) && (
              <NodeOverlayCornerRadiusHandle anchor="se" node_id={node_id} />
            )}
          <LayerOverlayRotationHandle anchor="nw" node_id={node_id} />
          <LayerOverlayRotationHandle anchor="ne" node_id={node_id} />
          <LayerOverlayRotationHandle anchor="sw" node_id={node_id} />
          <LayerOverlayRotationHandle anchor="se" node_id={node_id} />
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
          movement: e.movement,
          initial: e.initial,
          xy: e.xy,
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
  offset = 10,
  size = 16,
}: {
  node_id: string;
  anchor: "nw" | "ne" | "sw" | "se";
  offset?: number;
  size?: number;
}) {
  const { getNodeAbsoluteRotation } = useDocument();
  const { dragRotationHandleStart, dragRotationHandle, dragRotationHandleEnd } =
    useEventTarget();

  const rotation = getNodeAbsoluteRotation(node_id);

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
          movement: e.movement,
          initial: e.initial,
          xy: e.xy,
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

  const anchor_initial_cursor_rotation = {
    nw: -45,
    ne: 45,
    sw: -135,
    se: 135,
  };

  const cursor_svg_data = useMemo(() => {
    // TODO: not accurate
    const initial_rotation = anchor_initial_cursor_rotation[anchor];
    const svg_rotation = rotation === 0 ? initial_rotation : rotation;
    return cursors.rotate_svg_data(svg_rotation);
  }, [rotation, anchor]);

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
        cursor: `url(${cursor_svg_data}) 12 12, auto`,
        touchAction: "none",
      }}
    />
  );
}

function LayerOverlayResizeHandle({
  selection,
  anchor,
  size = 8,
}: {
  selection: string | string[];
  anchor: "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w";
  size?: number;
}) {
  const { dragResizeHandleStart, dragResizeHandleEnd, dragResizeHandle } =
    useEventTarget();

  const bind = useGesture(
    {
      onClick: ({ event }) => {
        event.preventDefault();
        event.stopPropagation();
      },
      onDragStart: (e) => {
        e.event.stopPropagation();
        dragResizeHandleStart(selection, anchor);
      },
      onDragEnd: (e) => {
        e.event.stopPropagation();
        dragResizeHandleEnd();
      },
      onDrag: (e) => {
        e.event.stopPropagation();
        dragResizeHandle(anchor, {
          delta: e.delta,
          distance: e.distance,
          movement: e.movement,
          initial: e.initial,
          xy: e.xy,
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

  return <Knob size={size} {...bind()} anchor={anchor} />;
}

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
          className="m-0 p-0 border-none outline-none appearance-none bg-transparent h-full overflow-visible resize-none"
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

function usePrefferedDistributionAxis() {
  const { selection, state, distributeEvenly } = useDocument();

  const [axis, setAxis] = useState<"x" | "y">();

  useEffect(() => {
    const rects = selection.map(
      (node_id) => domapi.get_node_bounding_rect(node_id)!
    );
    const x_distribute = cmath.rect.axisProjectionIntersection(rects, "x");
    if (x_distribute) {
      const dist = cmath.rect.getGaps(rects, "x");
      if (!gapsAreAligned(dist)) {
        setAxis("x");
        return;
      }
    }

    const y_distribute = cmath.rect.axisProjectionIntersection(rects, "y");
    if (y_distribute) {
      const dist = cmath.rect.getGaps(rects, "y");
      if (!gapsAreAligned(dist)) {
        setAxis("y");
        return;
      }
    }

    setAxis(undefined);
  }, [selection, state.document.nodes]);

  return axis;
}

function DistributeButton() {
  const { distributeEvenly } = useDocument();
  const axis = usePrefferedDistributionAxis();
  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    distributeEvenly("selection", axis!);
  };

  if (!axis) return <></>;

  return (
    <div className="absolute hidden group-hover:block bottom-1 right-1 z-50">
      <button
        className="p-1 bg-workbench-accent-sky text-white rounded"
        onClick={onClick}
      >
        {axis === "x" ? <ColumnsIcon /> : <RowsIcon />}
      </button>
    </div>
  );
}

const gapsAreAligned = (arr: number[], tolerance = 0.1) =>
  arr.every((v) => Math.abs(v - arr[0]) <= tolerance);
