"use client";

import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DropzoneIndication,
  GestureState,
  type Guide,
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
import { ViewportSurfaceContext, useViewport } from "./context";
import {
  SurfaceSelectionGroup,
  SurfaceSelectionGroupProvider,
  useSurfaceSelectionGroups,
  useSelectionGroups,
  useSingleSelection,
} from "./surface-hooks";
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
import {
  vector2ToSurfaceSpace,
  rectToSurfaceSpace,
  offsetToSurfaceSpace,
} from "../utils/transform";
import { RedDotHandle } from "./ui/reddot";
import { ObjectsDistributionAnalysis } from "./ui/distribution";
import { AxisRuler, Tick } from "@grida/ruler";
import { PixelGrid } from "@grida/pixel-grid";
import { Rule } from "./ui/rule";
import type { BitmapEditorBrush } from "@grida/bitmap";

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
    ruler,
    pixelgrid,
    marquee,
    hovered_node_id,
    dropzone,
    selection,
    tool,
    brush,
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

  const selectiondata = useSelectionGroups(...selection);

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
        {ruler === "on" && <RulerGuideOverlay />}
        {pixelgrid === "on" && <PixelGridOverlay />}
        <FloatingCursorTooltip />
        {tool?.type === "brush" && <BrushCursor brush={brush} />}

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
                !!marquee || tool.type !== "cursor" || is_node_transforming
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

function BrushCursor({ brush }: { brush: BitmapEditorBrush }) {
  const { transform, scaleX, scaleY } = useTransform();
  const { pointer } = useEventTarget();
  const pos = vector2ToSurfaceSpace(
    // quantize position to canvas space 1.
    cmath.vector2.quantize(pointer.position, 1),
    // pointer.position,
    transform
  );
  const { size: _size } = brush;
  const [width, height] = cmath.vector2.multiply(_size, [scaleX, scaleY]);

  return (
    <svg
      className="absolute pointer-events-none transform-gpu"
      style={{
        zIndex: 99,
        top: pos[1],
        left: pos[0],
        overflow: "visible",
        transform: `translate(-50%, -50%)`,
      }}
      width={width}
      height={height}
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="transparent"
        stroke="black"
        strokeWidth={1}
      />
      {/* <circle r={size / 2} fill="transparent" stroke="black" strokeWidth={2} /> */}
    </svg>
  );
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
  if (!selection || selection.length === 0) {
    return <></>;
  } else if (selection.length === 1) {
    return (
      <SingleSelectionOverlay node_id={selection[0]} readonly={readonly} />
    );
  } else {
    return <MultpleSelectionGroupsOverlay readonly={readonly} />;
  }
}

function SingleSelectionOverlay({
  node_id,
  readonly,
}: {
  node_id: string;
  readonly?: boolean;
}) {
  const { is_node_translating, gesture, startGapGesture } = useEventTarget();
  const data = useSingleSelection(node_id);
  if (!data) return <></>;

  const { node, distribution, rotation, style, boundingSurfaceRect } = data;

  return (
    <>
      <div className="group">
        {node.meta.is_flex_parent &&
          distribution &&
          (gesture.type === "idle" || gesture.type === "gap") &&
          // TODO: support rotated surface
          rotation === 0 && (
            <>
              <GapOverlay
                offset={[boundingSurfaceRect.x, boundingSurfaceRect.y]}
                distribution={distribution}
                style={style}
                onGapGestureStart={(axis) => {
                  startGapGesture(node_id, axis);
                }}
              />
            </>
          )}
        <SurfaceGroup hidden={is_node_translating}>
          <NodeOverlay node_id={node_id} readonly={readonly} focused />
        </SurfaceGroup>
      </div>
    </>
  );
}

function MultpleSelectionGroupsOverlay({ readonly }: { readonly?: boolean }) {
  const { is_node_translating, gesture, startGapGesture } = useEventTarget();
  const groups = useSurfaceSelectionGroups();

  return (
    <>
      {groups.map((g: SurfaceSelectionGroup) => (
        <div key={g.group} className="group">
          {(gesture.type === "idle" || gesture.type === "gap") &&
            g.distribution && (
              <GapOverlay
                offset={[g.boundingSurfaceRect.x, g.boundingSurfaceRect.y]}
                distribution={g.distribution}
                style={g.style}
                onGapGestureStart={(axis) => {
                  startGapGesture(g.ids, axis);
                }}
              />
            )}
          <SurfaceGroup hidden={is_node_translating}>
            <SortOverlay {...g} />
            <SelectionGroupOverlay {...g} readonly={readonly} />
          </SurfaceGroup>
        </div>
      ))}
    </>
  );
  //
}

function SelectionGroupOverlay({
  readonly,
  ...groupdata
}: SurfaceSelectionGroup & {
  readonly?: boolean;
}) {
  const { multipleSelectionOverlayClick, tool } = useEventTarget();

  const { distributeEvenly } = useDocument();

  const { style, ids, boundingSurfaceRect, size, distribution } = groupdata;

  const enabled = !readonly && tool.type === "cursor";

  const bind = useSurfaceGesture(
    {
      onPointerDown: ({ event }) => {
        // if insert mode, the event should be passed to the master to start the insertion
        if (tool.type !== "insert" && tool.type !== "draw") {
          // otherwise, it should be stopped here
          // prevent default to prevent the master event target from changing the selection
          event.preventDefault();
        }
      },
      onClick: (e) => {
        multipleSelectionOverlayClick(ids, e.event);
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

  if (!distribution) return <></>;

  const { preferredDistributeEvenlyActionAxis } = distribution;

  return (
    <>
      <LayerOverlay
        {...bind()}
        readonly={readonly}
        transform={style}
        zIndex={10}
      >
        <LayerOverlayResizeHandle anchor="n" selection={ids} />
        <LayerOverlayResizeHandle anchor="s" selection={ids} />
        <LayerOverlayResizeHandle anchor="e" selection={ids} />
        <LayerOverlayResizeHandle anchor="w" selection={ids} />
        <LayerOverlayResizeHandle anchor="nw" selection={ids} />
        <LayerOverlayResizeHandle anchor="ne" selection={ids} />
        <LayerOverlayResizeHandle anchor="sw" selection={ids} />
        <LayerOverlayResizeHandle anchor="se" selection={ids} />
        {/*  */}
        <DistributeButton
          axis={preferredDistributeEvenlyActionAxis}
          onClick={(axis) => {
            distributeEvenly("selection", axis);
          }}
        />
        {boundingSurfaceRect && (
          <SizeMeterLabel
            offset={16}
            size={size}
            rect={{ ...boundingSurfaceRect, x: 0, y: 0 }}
            className="bg-workbench-accent-sky text-white"
          />
        )}
      </LayerOverlay>
      {
        // also hightlight the included nodes
        ids.map((node_id) => (
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
  const { scaleX, scaleY } = useTransform();

  const data = useSingleSelection(node_id);

  if (!data) return <></>;

  const { node, style, size } = data;

  const { is_component_consumer, is_flex_parent } = node.meta;
  readonly = readonly || is_component_consumer;

  const measurement_rect = {
    x: 0,
    y: 0,
    width: size[0] * scaleX,
    height: size[1] * scaleY,
  };

  return (
    <>
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
        {focused && !readonly && (
          <SizeMeterLabel
            offset={16}
            size={size}
            rect={{ ...measurement_rect, x: 0, y: 0 }}
            className="bg-workbench-accent-sky text-white"
          />
        )}
      </LayerOverlay>
    </>
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

function SortOverlay(props: SurfaceSelectionGroup) {
  const {
    ids,
    objects: items,
    boundingSurfaceRect: boundingClientRect,
    style,
  } = props;

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
            <RedDotSortHandle selection={ids} node_id={item.id} />
          </div>
        );
      })}
    </div>
  );
}

function RedDotSortHandle({
  selection,
  node_id,
}: {
  node_id: string;
  selection: string[];
}) {
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

function GapOverlay({
  onGapGestureStart,
  offset,
  style,
  distribution,
}: {
  distribution: ObjectsDistributionAnalysis;
  offset?: cmath.Vector2;
  style?: React.CSSProperties;
} & {
  onGapGestureStart?: (axis: cmath.Axis) => void;
}) {
  const { transform } = useTransform();

  const { x, y, rects: _rects } = distribution;

  // rects in surface space
  const rects = useMemo(
    () => _rects.map((r) => rectToSurfaceSpace(r, transform)),
    [_rects, transform]
  );

  return (
    <div style={style} className="pointer-events-none z-50">
      <div>
        {_rects.length >= 2 && (
          <>
            {x && x.gap !== undefined && (
              <>
                {Array.from({ length: x.gaps.length }).map((_, i) => {
                  const axis = "x";
                  const x_sorted = rects.sort((a, b) => a.x - b.x);
                  const a = x_sorted[i];
                  const b = x_sorted[i + 1];

                  return (
                    <GapWithHandle
                      key={i}
                      a={a}
                      b={b}
                      axis={axis}
                      offset={offset}
                      onGapGestureStart={onGapGestureStart}
                    />
                  );
                })}
              </>
            )}
            {y && y.gap !== undefined && (
              <>
                {Array.from({ length: y.gaps.length }).map((_, i) => {
                  const axis = "y";
                  const y_sorted = rects.sort((a, b) => a.y - b.y);
                  const a = y_sorted[i];
                  const b = y_sorted[i + 1];

                  return (
                    <GapWithHandle
                      key={i}
                      a={a}
                      b={b}
                      axis={axis}
                      offset={offset}
                      onGapGestureStart={onGapGestureStart}
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

function GapWithHandle({
  a,
  b,
  axis,
  offset = cmath.vector2.zero,
  onGapGestureStart,
}: {
  a: cmath.Rectangle;
  b: cmath.Rectangle;
  axis: cmath.Axis;
  offset?: cmath.Vector2;
  onGapGestureStart?: (axis: cmath.Axis) => void;
}) {
  const { gesture } = useEventTarget();

  const r = useMemo(() => {
    const intersection = cmath.rect.axisProjectionIntersection([a, b], axis)!;

    if (!intersection) return null;

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

  if (!r) return null;

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
          <GapHandle axis={axis} onGapGestureStart={onGapGestureStart} />
        </div>
      </div>
    </>
  );
}

function GapHandle({
  axis,
  onGapGestureStart,
}: {
  axis: cmath.Axis;
  onGapGestureStart?: (axis: cmath.Axis) => void;
}) {
  const bind = useSurfaceGesture({
    onPointerDown: ({ event }) => {
      event.preventDefault();
    },
    onDragStart: ({ event }) => {
      event.preventDefault();
      onGapGestureStart?.(axis);
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

function PixelGridOverlay() {
  const { transform, scaleX } = useTransform();
  const viewport = useViewport();
  return (
    <div className="fixed inset-0">
      {scaleX > 4 && (
        <PixelGrid
          transform={transform}
          width={viewport?.clientWidth ?? 0}
          height={viewport?.clientHeight ?? 0}
        />
      )}
    </div>
  );
}

function RulerGuideOverlay() {
  const { guides, startGuideGesture } = useEventTarget();
  const { scaleX, scaleY, transform } = useTransform();
  const viewport = useViewport();
  const d = useSurfaceSelectionGroups();

  const bindX = useSurfaceGesture({
    onDragStart: ({ event }) => {
      startGuideGesture("y", -1);
      event.preventDefault();
    },
  });

  const bindY = useSurfaceGesture({
    onDragStart: ({ event }) => {
      startGuideGesture("x", -1);
      event.preventDefault();
    },
  });

  const ranges = useMemo(() => {
    const flat = d.flatMap((g) => g.objects);
    return flat
      .map(({ boundingRect }) => {
        const rect = cmath.rect.quantize(boundingRect, 0.01);
        const x = cmath.range.fromRectangle(rect, "x");
        const y = cmath.range.fromRectangle(rect, "y");
        return { x, y };
      })
      .reduce(
        (acc, { x, y }) => {
          acc.x.push(x);
          acc.y.push(y);
          return acc;
        },
        { x: [] as cmath.Range[], y: [] as cmath.Range[] }
      );
  }, [d]);

  const marks = guides.reduce(
    (acc, g) => {
      if (g.axis === "x") {
        acc.y.push(g.offset);
      } else {
        acc.x.push(g.offset);
      }
      return acc;
    },
    { x: [] as number[], y: [] as number[] }
  );

  const tx = transform[0][2];
  const ty = transform[1][2];

  return (
    <div className="fixed w-full h-full pointer-events-none z-50">
      <div
        {...bindX()}
        className="z-30 fixed top-0 left-0 right-0 border-b bg-background cursor-ns-resize pointer-events-auto touch-none"
      >
        <AxisRuler
          axis="x"
          width={viewport?.clientWidth ?? 0}
          height={20}
          overlapThreshold={80}
          textSideOffset={10}
          zoom={scaleX}
          offset={tx}
          ranges={ranges.x}
          marks={marks.y.map(
            (m) =>
              ({
                pos: m,
                text: m.toString(),
                textAlign: "start",
                textAlignOffset: 8,
                strokeColor: "red",
                strokeWidth: 0.5,
                strokeHeight: 24,
                color: "red",
              }) satisfies Tick
          )}
        />
      </div>
      <div
        {...bindY()}
        className="z-20 fixed top-0 left-0 bottom-0 border-r bg-background cursor-ew-resize pointer-events-auto touch-none"
      >
        <AxisRuler
          axis="y"
          width={20}
          height={viewport?.clientHeight ?? 0}
          overlapThreshold={80}
          textSideOffset={10}
          zoom={scaleY}
          offset={ty}
          ranges={ranges.y}
          marks={marks.x.map(
            (m) =>
              ({
                pos: m,
                text: m.toString(),
                textAlign: "end",
                textAlignOffset: 8,
                strokeColor: "red",
                strokeWidth: 0.5,
                strokeHeight: 24,
                color: "red",
              }) satisfies Tick
          )}
        />
      </div>
      {/* Guides */}
      <div className="z-10">
        {guides.map((g, i) => {
          return <Guide key={i} idx={i} axis={g.axis} offset={g.offset} />;
        })}
      </div>
    </div>
  );
  //
}

function Guide({ axis, offset, idx }: Guide & { idx: number }) {
  const { transform } = useTransform();
  const { startGuideGesture, deleteGuide } = useEventTarget();
  const o = offsetToSurfaceSpace(offset, axis, transform);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);

  const bind = useSurfaceGesture({
    onFocus: ({ event }) => {
      event.stopPropagation();
      setFocused(true);
    },
    onBlur: ({ event }) => {
      event.stopPropagation();
      setFocused(false);
    },
    onHover: (s) => {
      if (s.first) setHover(true);
      if (s.last) setHover(false);
    },
    onPointerDown: ({ event }) => {
      // ensure the div focuses
      (event.currentTarget as HTMLElement)?.focus();
      event.preventDefault();
    },
    onKeyDown: ({ event }) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        deleteGuide(idx);
      }
      if (event.key === "Escape") {
        (event.currentTarget as HTMLElement)?.blur();
      }
      event.stopPropagation();
    },
    onDragStart: ({ event }) => {
      startGuideGesture(axis, idx);
      event.preventDefault();
    },
  });

  return (
    <div
      role="button"
      tabIndex={idx}
      {...bind()}
      data-axis={axis}
      className="pointer-events-auto touch-none cursor-pointer data-[axis='x']:cursor-ew-resize data-[axis='y']:cursor-ns-resize"
    >
      <Rule
        width={hover || focused ? 1 : 0.5}
        axis={cmath.counterAxis(axis)}
        offset={o}
        padding={4}
        data-focus={focused}
        className="data-[focus='true']:text-workbench-accent-sky"
      />
    </div>
  );
}
