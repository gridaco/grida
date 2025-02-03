"use client";

import React, { useContext, useEffect, useMemo, useRef } from "react";
import {
  DropzoneIndication,
  GestureState,
  useEventTarget,
} from "@/grida-react-canvas";
import { useGesture as __useGesture, useGesture } from "@use-gesture/react";
import {
  useClipboardSync,
  useDocument,
  useEventTargetCSSCursor,
  useNode,
  useTransform,
} from "../provider";
import { useIsWindowResizing } from "./hooks/window-resizing";
import { supports } from "@/grida/utils/supports";
import { MarqueeArea } from "./ui/marquee";
import { LayerOverlay } from "./ui/layer";
import { ViewportSurfaceContext } from "./context";
import {
  useGroupSurfaceTransform,
  useNodeSurfaceTransfrom,
} from "./hooks/transform";
import { MeasurementGuide } from "./ui/measurement";
import { SnapGuide } from "./ui/snap";
import { Knob } from "./ui/knob";
import { ColumnsIcon, RowsIcon } from "@radix-ui/react-icons";
import { cmath } from "@grida/cmath";
import { cursors } from "../components/cursor";
import { SurfaceTextEditor } from "./ui/text-editor";
import { SurfacePathEditor } from "./ui/path-editor";
import { SizeMeterLabel } from "./ui/meter";
import { SurfaceGradientEditor } from "./ui/gradient-editor";
import { vector2ToSurfaceSpace, rectToSurfaceSpace } from "../utils/transform";
import { RedDotHandle } from "./ui/reddot";
import {
  SurfaceSelectionGroupProvider,
  useSurfaceSelectionGroup,
} from "./core";

const DRAG_THRESHOLD = 2;

/*
const SURFACE_TRANSFORM_CONTEXT = React.createContext<cmath.Transform>(
  cmath.transform.identity
);

function SurfaceTransformContextProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const { transform } = useTransform();
  return (
    <SURFACE_TRANSFORM_CONTEXT.Provider value={transform}>
      {children}
    </SURFACE_TRANSFORM_CONTEXT.Provider>
  );
}
 */

function useSurfaceGesture(
  {
    onClick,
    onDoubleClick,
    onDragStart,
    onDragEnd,
    ...handlers
  }: Parameters<typeof __useGesture>[0],
  config?: Parameters<typeof __useGesture>[1]
) {
  // click / double click triggers when drag ends (if double pointer down) - it might be a better idea to prevent it with the displacement, not by delayed flag
  const should_prevent_click = useRef(false);

  return __useGesture(
    {
      onClick: (e) => {
        if (should_prevent_click.current) {
          return;
        }
        onClick?.(e);
      },
      onDoubleClick: (e) => {
        if (should_prevent_click.current) {
          return;
        }
        onDoubleClick?.(e);
      },
      ...handlers,
      onDragStart: (e) => {
        onDragStart?.(e);
        should_prevent_click.current = true;
      },
      onDragEnd: (e) => {
        onDragEnd?.(e);
        setTimeout(() => {
          should_prevent_click.current = false;
        }, 100);
      },
    },
    config
  );
}

function SurfaceGroup({
  hidden,
  children,
}: React.PropsWithChildren<{ hidden?: boolean }>) {
  return (
    <div
      data-ux-hidden={hidden}
      className="opacity-100 data-[ux-hidden='true']:opacity-0 transition-colors"
    >
      {children}
    </div>
  );
}

export function EditorSurface() {
  const isWindowResizing = useIsWindowResizing();
  const { transform } = useTransform();
  const {
    zoom,
    pan,
    pointer,
    marquee,
    hovered_node_id,
    dropzone,
    selection,
    cursor_mode,
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
    tryToggleContentEditMode,
  } = useEventTarget();
  const cursor = useEventTargetCSSCursor();
  const eventTargetRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const context = useContext(ViewportSurfaceContext);

  useEffect(() => {
    context?.setPortalRef?.(portalRef.current);

    // Clean up when component unmounts
    return () => {
      context?.setPortalRef?.(null);
    };
  }, [context, portalRef]);

  //
  // hook for pointer move event.
  // pointer move event should 'always-trigger', to make this easier and clear, we register the listener for pointer move to a window.
  //
  useEffect(() => {
    if (!eventTargetRef.current) return;
    const et = eventTargetRef.current;
    const handlePointerMove = (event: PointerEvent) => {
      if (event.defaultPrevented) return;
      // for performance reasons, we don't want to update the overlay when transforming (except for translate)
      if (is_node_transforming && !is_node_translating) return;
      pointerMove(event);
    };

    et.addEventListener("pointermove", handlePointerMove, {
      capture: true,
    });

    return () =>
      et.removeEventListener("pointermove", handlePointerMove, {
        capture: true,
      });
  }, [eventTargetRef.current]);

  const bind = useSurfaceGesture(
    {
      onPointerDown: ({ event }) => {
        if (event.defaultPrevented) return;
        pointerDown(event);
      },
      onPointerUp: ({ event }) => {
        if (event.defaultPrevented) return;
        pointerUp(event);
      },
      onClick: ({ event }) => {
        if (event.defaultPrevented) return;
        click(event);
      },
      onDoubleClick: ({ event }) => {
        if (event.defaultPrevented) return;

        // [order matters] - otherwise, it will always try to enter the content edit mode
        tryToggleContentEditMode(); // 1
        doubleClick(event); // 2
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
        threshold: DRAG_THRESHOLD,
        // disable drag gesture with arrow keys
        keyboardDisplacement: 0,
      },
    }
  );

  // pinch & wheel gesture (zoom and panning)
  useGesture(
    {
      onWheel: (state) => {
        const { event, delta, ctrlKey, metaKey } = state;
        if (event.defaultPrevented) return;
        // when pinching (on mac os, ctrlKey is set true even when no key pressed), this is true.
        if (ctrlKey || metaKey) {
          // zoom
          const targetRect = eventTargetRef.current!.getBoundingClientRect();
          const ox = event.clientX - targetRect.left;
          const oy = event.clientY - targetRect.top;
          const origin: [number, number] = [ox, oy];
          const d = delta[1];
          const sensitivity = 0.01;
          const zoom_delta = -d * sensitivity;
          zoom(zoom_delta, origin);
        } else {
          const sensitivity = 2;
          pan(
            cmath.vector2.invert(
              cmath.vector2.multiply(delta, [sensitivity, sensitivity])
            )
          );
        }

        event.preventDefault();
      },
    },
    {
      wheel: {
        eventOptions: {
          passive: false,
        },
      },
      target: eventTargetRef,
    }
  );

  const selectiondata = useGroupSurfaceTransform(...selection);

  return (
    <SurfaceSelectionGroupProvider value={selectiondata}>
      <div
        id="event-target"
        ref={eventTargetRef}
        {...bind()}
        tabIndex={0}
        className="absolute inset-0 pointer-events-auto will-change-transform z-50 select-none"
        style={{
          userSelect: "none",
          touchAction: "none",
          outline: "none",
          cursor: cursor,
        }}
      >
        <FloatingCursorTooltip />
        {/* <div className="absolute w-full h-full z-50">
        {transform[0][0] > 4 && (
          <PixelGrid zoomLevel={transform[0][0]} cellSize={1} />
        )}
      </div> */}
        <div
          style={{
            position: "absolute",
          }}
        >
          {/* <DebugPointer position={toSurfaceSpace(pointer.position, transform)} /> */}
          {marquee && (
            <div
              id="marquee-container"
              className="absolute top-0 left-0 w-0 h-0"
            >
              <MarqueeArea
                a={vector2ToSurfaceSpace(marquee.a, transform)}
                b={vector2ToSurfaceSpace(marquee.b, transform)}
              />
            </div>
          )}
        </div>
        <div
          className="w-full h-full"
          id="canvas-overlay-portal"
          ref={portalRef}
        >
          <MeasurementGuide />
          <SnapGuide />

          <SurfaceGroup hidden={is_node_translating || isWindowResizing}>
            {content_edit_mode?.type === "text" && (
              <SurfaceTextEditor
                key="text-editor"
                node_id={content_edit_mode.node_id}
              />
            )}
            {content_edit_mode?.type === "path" && (
              <SurfacePathEditor
                key="path-editor"
                node_id={content_edit_mode.node_id}
              />
            )}
            {content_edit_mode?.type === "gradient" && (
              <SurfaceGradientEditor
                key="gradient-editor"
                node_id={content_edit_mode.node_id}
              />
            )}
          </SurfaceGroup>
          <SurfaceGroup
            hidden={isWindowResizing || content_edit_mode?.type === "path"}
          >
            <SelectionOverlay
              selection={selection}
              readonly={!!content_edit_mode}
            />
          </SurfaceGroup>
          <SurfaceGroup
            hidden={isWindowResizing || content_edit_mode?.type === "path"}
          >
            <SurfaceGroup
              hidden={
                !!marquee ||
                cursor_mode.type !== "cursor" ||
                is_node_transforming
              }
            >
              {hovered_node_id && (
                // general hover
                <NodeOverlay node_id={hovered_node_id} readonly />
              )}
            </SurfaceGroup>
          </SurfaceGroup>
          {dropzone && <DropzoneOverlay {...dropzone} />}
        </div>
      </div>
    </SurfaceSelectionGroupProvider>
  );
}

function DropzoneOverlay(props: DropzoneIndication) {
  const { transform } = useTransform();
  switch (props.type) {
    case "node":
      return <NodeOverlay node_id={props.node_id} readonly />;
    case "rect":
      const r = rectToSurfaceSpace(props.rect, transform);
      return (
        <LayerOverlay
          transform={{
            top: r.y,
            left: r.x,
            width: r.width,
            height: r.height,
          }}
          readonly
        />
      );
  }
}

/**
 * Provides browser clipboard api compatibility
 */
export function EditorSurfaceClipboardSyncProvider({
  children,
}: React.PropsWithChildren<{}>) {
  useClipboardSync();

  return <>{children}</>;
}

function FloatingCursorTooltip() {
  const { gesture, pointer, transform } = useEventTarget();
  const pos = vector2ToSurfaceSpace(pointer.position, transform);
  const value = get_cursor_tooltip_value(gesture);
  if (value) {
    return (
      <div
        className="absolute pointer-events-none transform-gpu"
        style={{
          zIndex: 99,
          top: pos[1],
          left: pos[0],
          // align to top right
          transform: "translate(8px, calc(-100% - 8px))",
        }}
      >
        <div className="bg-pink-500 text-white text-xs px-1 py-0.5 rounded shadow">
          {value}
        </div>
      </div>
    );
  }
}

function get_cursor_tooltip_value(gesture: GestureState) {
  switch (gesture.type) {
    case "gap":
      return cmath.ui.formatNumber(gesture.gap, 1);
    case "rotate":
      return cmath.ui.formatNumber(gesture.rotation, 1) + "°";
    case "translate":
    case "scale":
    case "sort":
    default:
      return undefined;
  }
}

function SelectionOverlay({
  readonly,
  selection = [],
}: {
  readonly?: boolean;
  selection?: string[];
}) {
  const { is_node_translating, gesture } = useEventTarget();

  if (!selection || selection.length === 0) {
    return <></>;
  } else if (selection.length === 1) {
    return (
      <SurfaceGroup hidden={is_node_translating}>
        <NodeOverlay node_id={selection[0]} readonly={readonly} focused />
      </SurfaceGroup>
    );
  } else {
    return (
      <div className="group">
        {(gesture.type === "idle" || gesture.type === "gap") && <GapOverlay />}
        <SurfaceGroup hidden={is_node_translating}>
          <SortOverlay />
          <MultipleSelectionOverlay selection={selection} readonly={readonly} />
        </SurfaceGroup>
      </div>
    );
  }
}

function MultipleSelectionOverlay({
  selection,
  readonly,
}: {
  selection: string[];
  readonly?: boolean;
}) {
  const { multipleSelectionOverlayClick, cursor_mode } = useEventTarget();

  const { distributeEvenly } = useDocument();

  const {
    style,
    boundingSurfaceRect: boundingRect,
    size,
    distribution,
  } = useSurfaceSelectionGroup();

  const { preferredDistributeEvenlyActionAxis } = distribution;

  const enabled = !readonly && cursor_mode.type === "cursor";

  const bind = useSurfaceGesture(
    {
      onPointerDown: ({ event }) => {
        // if insert mode, the event should be passed to the master to start the insertion
        if (cursor_mode.type !== "insert" && cursor_mode.type !== "draw") {
          // otherwise, it should be stopped here
          // prevent default to prevent the master event target from changing the selection
          event.preventDefault();
        }
      },
      onClick: (e) => {
        multipleSelectionOverlayClick(selection, e.event);
        e.event.stopPropagation();
      },
    },
    {
      drag: {
        enabled: enabled,
        threshold: DRAG_THRESHOLD,
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
        transform={style}
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
        <DistributeButton
          axis={preferredDistributeEvenlyActionAxis}
          onClick={(axis) => {
            distributeEvenly("selection", axis);
          }}
        />
        {boundingRect && (
          <SizeMeterLabel
            offset={16}
            size={size}
            rect={{ ...boundingRect, x: 0, y: 0 }}
            className="bg-workbench-accent-sky text-white"
          />
        )}
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
  focused,
}: {
  node_id: string;
  readonly?: boolean;
  zIndex?: number;
  focused?: boolean;
}) {
  const { style, rect, size } = useNodeSurfaceTransfrom(node_id);
  const node = useNode(node_id);

  const { is_component_consumer } = node.meta;
  readonly = readonly || is_component_consumer;

  return (
    <LayerOverlay
      readonly={readonly}
      transform={style}
      zIndex={zIndex}
      isComponentConsumer={is_component_consumer}
    >
      {focused && !readonly && (
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
      {focused && !readonly && rect && (
        <SizeMeterLabel
          offset={16}
          size={size}
          rect={{ ...rect, x: 0, y: 0 }}
          className="bg-workbench-accent-sky text-white"
        />
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
  const { startCornerRadiusGesture } = useEventTarget();

  const bind = useSurfaceGesture({
    onDragStart: ({ event }) => {
      event.preventDefault();
      startCornerRadiusGesture(node_id);
    },
  });

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
  const { startRotateGesture } = useEventTarget();

  const rotation = getNodeAbsoluteRotation(node_id);

  const bind = useSurfaceGesture({
    onDragStart: ({ event }) => {
      event.preventDefault();
      startRotateGesture(node_id);
    },
  });

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
  const { startScaleGesture } = useEventTarget();

  const bind = useSurfaceGesture({
    onPointerDown: ({ event }) => {
      event.preventDefault();
    },
    onDragStart: ({ event }) => {
      event.preventDefault();
      startScaleGesture(selection, anchor);
    },
  });

  return <Knob size={size} {...bind()} anchor={anchor} />;
}

function SortOverlay() {
  const {
    objects: items,
    boundingSurfaceRect: boundingClientRect,
    style,
  } = useSurfaceSelectionGroup();

  return (
    <div style={style} className="pointer-events-none z-50">
      {items.map((item) => {
        return (
          <div
            key={item.id}
            style={{
              position: "absolute",
              top:
                item.boundingSurfaceRect.y +
                item.boundingSurfaceRect.height / 2 -
                boundingClientRect.y,
              left:
                item.boundingSurfaceRect.x +
                item.boundingSurfaceRect.width / 2 -
                boundingClientRect.x,
            }}
          >
            <RedDotSortHandle node_id={item.id} />
          </div>
        );
      })}
    </div>
  );
}

function RedDotSortHandle({ node_id }: { node_id: string }) {
  const { selection } = useSurfaceSelectionGroup();
  const { startSortGesture } = useEventTarget();
  const bind = useSurfaceGesture({
    onPointerDown: ({ event }) => {
      event.preventDefault();
    },
    onDragStart: ({ event }) => {
      event.preventDefault();
      startSortGesture(selection, node_id);
    },
  });

  return <RedDotHandle {...bind()} />;
}

function GapOverlay() {
  const {
    objects: items,
    boundingSurfaceRect,
    distribution,
    style,
  } = useSurfaceSelectionGroup();

  const { x, y } = distribution;

  return (
    <div style={style} className="pointer-events-none z-50">
      <div>
        {items.length >= 2 && (
          <>
            {x && x.gap !== undefined && (
              <>
                {Array.from({ length: x.gaps.length }).map((_, i) => {
                  const axis = "x";
                  const x_sorted = items.sort(
                    (a, b) => a.boundingSurfaceRect.x - b.boundingSurfaceRect.x
                  );
                  const a = x_sorted[i];
                  const b = x_sorted[i + 1];

                  return (
                    <Gap
                      key={i}
                      a={a.boundingSurfaceRect}
                      b={b.boundingSurfaceRect}
                      axis={axis}
                      offset={[boundingSurfaceRect.x, boundingSurfaceRect.y]}
                    />
                  );
                })}
              </>
            )}
            {y && y.gap !== undefined && (
              <>
                {Array.from({ length: y.gaps.length }).map((_, i) => {
                  const axis = "y";
                  const y_sorted = items.sort(
                    (a, b) => a.boundingSurfaceRect.y - b.boundingSurfaceRect.y
                  );
                  const a = y_sorted[i];
                  const b = y_sorted[i + 1];

                  return (
                    <Gap
                      key={i}
                      a={a.boundingSurfaceRect}
                      b={b.boundingSurfaceRect}
                      axis={axis}
                      offset={[boundingSurfaceRect.x, boundingSurfaceRect.y]}
                    />
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Gap({
  a,
  b,
  axis,
  offset = cmath.vector2.zero,
}: {
  a: cmath.Rectangle;
  b: cmath.Rectangle;
  axis: cmath.Axis;
  offset?: cmath.Vector2;
}) {
  const { gesture } = useEventTarget();

  const r = useMemo(() => {
    const intersection = cmath.rect.axisProjectionIntersection([a, b], axis)!;

    let rect: cmath.Rectangle;
    if (axis === "x") {
      const x1 = a.x + a.width;
      const y1 = intersection[0];
      const x2 = b.x;
      const y2 = intersection[1];

      rect = cmath.rect.fromPoints([
        [x1, y1],
        [x2, y2],
      ]);
    } else {
      const x1 = intersection[0];
      const y1 = a.y + a.height;
      const x2 = intersection[1];
      const y2 = b.y;

      rect = cmath.rect.fromPoints([
        [x1, y1],
        [x2, y2],
      ]);
    }

    return cmath.rect.translate(rect, cmath.vector2.invert(offset));
  }, [a, b, axis, offset]);

  const is_gesture = gesture.type === "gap";

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: r.y,
          left: r.x,
          width: r.width,
          height: r.height,
        }}
        data-is-gesture={is_gesture}
        className="pointer-events-none bg-transparent data-[is-gesture='true']:bg-workbench-accent-red/20"
      >
        <div
          data-is-gesture={is_gesture}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
          }}
          className="opacity-100 data-[is-gesture='true']:opacity-0"
        >
          <GapHandle axis={axis} />
        </div>
      </div>
    </>
  );
}

function GapHandle({ axis }: { axis: cmath.Axis }) {
  const { selection } = useSurfaceSelectionGroup();
  const { startGapGesture } = useEventTarget();

  const bind = useSurfaceGesture({
    onPointerDown: ({ event }) => {
      event.preventDefault();
    },
    onDragStart: ({ event }) => {
      event.preventDefault();
      startGapGesture(selection, axis);
    },
  });

  return (
    <button
      {...bind()}
      className="p-1 pointer-events-auto"
      style={{
        transform:
          "translate(-50%, -50%) " + (axis === "y" ? "rotate(90deg)" : ""),
        touchAction: "none",
        cursor: axis === "x" ? "ew-resize" : "ns-resize",
      }}
    >
      <div
        className="
      w-0.5 h-4 invisible
      group-hover:visible
      border border-pink-500
      hover:bg-pink-500
      ring-1 ring-white
      pointer-events-auto
      "
      />
    </button>
  );
}

function DistributeButton({
  axis,
  onClick,
}: {
  axis: cmath.Axis | undefined;
  onClick?: (axis: cmath.Axis) => void;
}) {
  if (!axis) {
    return <></>;
  }

  return (
    <div className="absolute hidden group-hover:block bottom-1 right-1 z-50 pointer-events-auto">
      <button
        className="p-1 bg-workbench-accent-sky text-white rounded pointer-events-auto"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(axis);
        }}
      >
        {axis === "x" ? <ColumnsIcon /> : <RowsIcon />}
      </button>
    </div>
  );
}
