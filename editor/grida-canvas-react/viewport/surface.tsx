"use client";

import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useGesture } from "@use-gesture/react";
import { useSurfaceGesture } from "./hooks/use-surface-gesture";
import {
  useBackendState,
  useBrushState,
  useClipboardSync,
  useContentEditModeMinimalState,
  useCurrentSceneState,
  useDocumentState,
  useEventTargetCSSCursor,
  useGestureState,
  useIsTransforming,
  useMultiplayerCursorState,
  usePointerState,
  useSelectionState,
  useToolState,
  useTransformState,
} from "../provider";
import { useCurrentEditor, useEditorState } from "../use-editor";
import { useIsWindowResizing } from "./hooks/window-resizing";
import {
  is_direct_component_consumer,
  supports,
} from "@/grida-canvas/utils/supports";
import { MarqueeArea } from "./ui/marquee";
import { Lasso } from "./ui/lasso/lasso";
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
import { VectorMeasurementGuide } from "./ui/vector-measurement";
import { SnapGuide } from "./ui/snap";
import { Knob } from "./ui/knob";
import { cursors } from "../../components/cursor/cursor-data";
import { SurfaceTextEditor } from "./ui/text-editor";
import { SurfaceVectorEditor } from "./ui/surface-vector-editor";
import { SurfaceGradientEditor } from "./ui/surface-gradient-editor";
import { SurfaceImageEditor } from "./ui/surface-image-editor";
import { SizeMeterLabel } from "./ui/meter";
import { RedDotHandle } from "./ui/reddot";
import { AxisRuler, Tick } from "@grida/ruler/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { PixelGrid } from "@grida/pixel-grid/react";
import { Rule } from "./ui/rule";
import type { BitmapEditorBrush } from "@grida/bitmap";
import { toast } from "sonner";
import {
  FloatingBar,
  FloatingBarContent,
  FloatingBarTitle,
} from "./ui/floating-bar";
import grida from "@grida/schema";
import { EdgeScrollingEffect } from "./hooks/use-edge-scrolling";
import { BezierCurvedLine } from "./ui/network-curve";
import type { editor } from "@/grida-canvas";
import { useFollowPlugin } from "../plugins/use-follow";
import { SurfaceVariableWidthEditor } from "./ui/surface-varwidth-editor";
import {
  MIN_NODE_OVERLAY_CORNER_RADIUS_VISIBLE_UI_SIZE,
  MIN_NODE_OVERLAY_GAP_VISIBLE_UI_SIZE,
  MIN_NODE_OVERLAY_PADDING_VISIBLE_UI_SIZE,
} from "../ui-config";
import {
  NodeOverlayCornerRadiusHandle,
  NodeOverlayRectangularCornerRadiusHandles,
} from "./ui/corner-radius-handle";
import {
  FakeCursorPosition,
  FakeForeignCursor,
} from "@/components/multiplayer/cursor";
import {
  DistributeButton,
  GapOverlay,
} from "./ui/surface-distribution-overlay";
import { PaddingOverlay } from "./ui/surface-padding-overlay";
import cmath from "@grida/cmath";
import { cn } from "@/components/lib/utils";

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

/**
 * similar to SurfaceGroup, but for ones that should have own event target, non-blocking.
 */
function SurfaceFragmentGroup({
  children,
  hidden,
}: React.PropsWithChildren<{ className?: string; hidden?: boolean }>) {
  if (hidden) return null;
  return <>{children}</>;
}

function SurfaceGroup({
  hidden,
  children,
  dontRenderWhenHidden,
  className,
}: React.PropsWithChildren<{
  hidden?: boolean;
  /**
   * completely remove from render tree, use this when the content is expensive and worth destroying.
   */
  dontRenderWhenHidden?: boolean;
  className?: string;
}>) {
  return (
    <div
      data-ux-hidden={hidden}
      className={cn(
        "opacity-100 data-[ux-hidden='true']:opacity-0 transition-colors",
        className
      )}
    >
      {hidden && dontRenderWhenHidden ? null : children}
    </div>
  );
}

export function EditorSurface() {
  const is_window_resizing = useIsWindowResizing();
  const is_transforming = useIsTransforming();
  const editor = useCurrentEditor();
  const { transform } = useTransformState();
  const { is_node_transforming, is_node_translating } = useGestureState();
  const { hovered_node_id, selection } = useSelectionState();
  const tool = useToolState();
  const content_edit_mode = useContentEditModeMinimalState();
  const pixelgrid = useEditorState(editor, (state) => state.pixelgrid);
  const ruler = useEditorState(editor, (state) => state.ruler);
  const dropzone = useEditorState(editor, (state) => state.dropzone);
  const brush = useBrushState();
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
      editor.surface.surfacePointerMove(event);
    };

    et.addEventListener("pointermove", handlePointerMove, {
      capture: true,
    });

    return () =>
      et.removeEventListener("pointermove", handlePointerMove, {
        capture: true,
      });
  }, [eventTargetRef.current]);

  const __hand_tool_triggered_by_aux_button = useRef(false);

  const bind = useSurfaceGesture(
    {
      onMouseDown: ({ event }) => {
        if (event.defaultPrevented) return;
        if (event.button === 1) {
          __hand_tool_triggered_by_aux_button.current = true;
          editor.surface.surfaceSetTool({ type: "hand" });
        }
      },
      onMouseUp: ({ event }) => {
        if (event.defaultPrevented) return;
        if (event.button === 1) {
          if (__hand_tool_triggered_by_aux_button.current) {
            __hand_tool_triggered_by_aux_button.current = false;
            editor.surface.surfaceSetTool({ type: "cursor" });
          }
        }
      },
      onPointerDown: ({ event }) => {
        if (event.defaultPrevented) return;
        editor.surface.surfacePointerDown(event);
      },
      onPointerUp: ({ event }) => {
        if (event.defaultPrevented) return;
        editor.surface.surfacePointerUp(event);
      },
      onClick: ({ event }) => {
        if (event.defaultPrevented) return;
        editor.surface.surfaceClick(event);
      },
      onDoubleClick: ({ event }) => {
        if (event.defaultPrevented) return;

        // [order matters] - otherwise, it will always try to enter the content edit mode
        editor.surface.surfaceTryToggleContentEditMode(); // 1
        editor.surface.surfaceDoubleClick(event); // 2
      },
      onDragStart: ({ event }) => {
        if (event.defaultPrevented) return;
        editor.surface.surfaceDragStart(event as PointerEvent);
      },
      onDragEnd: ({ event }) => {
        if (event.defaultPrevented) return;
        editor.surface.surfaceDragEnd(event as PointerEvent);
      },
      onDrag: (e) => {
        if (e.event.defaultPrevented) return;
        editor.surface.surfaceDrag({
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
        pointer: {
          buttons: [1, 4], // Primary button (1) // Aux button (4)
          keys: false, // disable drag gesture with arrow keys
        },
        threshold: DRAG_THRESHOLD,
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
          editor.camera.zoom(zoom_delta, origin);
        } else {
          const sensitivity = 2;
          editor.camera.pan(
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
      <EdgeScrollingEffect />
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
          overflowX: "scroll",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
        }}
        onScroll={(e) => {
          (e.target as HTMLDivElement).scrollLeft = 0;
        }}
      >
        <FollowingFrameOverlay />
        <NetworkOverlay transform={transform} />
        {ruler === "on" && <RulerGuideOverlay />}
        {pixelgrid === "on" && <PixelGridOverlay />}
        <FloatingCursorTooltip />
        {(tool?.type === "brush" || tool?.type === "eraser") && (
          <BrushCursor brush={brush} />
        )}

        <div
          style={{
            position: "absolute",
            pointerEvents: "none",
          }}
        >
          {/* <DebugPointer position={toSurfaceSpace(pointer.position, transform)} /> */}
          <RemoteCursorOverlay />
          <MarqueeOverlay />
          <LassoOverlay />
        </div>
        <div
          className="w-full h-full"
          id="canvas-overlay-portal"
          ref={portalRef}
        >
          <MeasurementGuide />
          {content_edit_mode?.type === "vector" && <VectorMeasurementGuide />}
          <SnapGuide />

          <SurfaceGroup>
            {content_edit_mode?.type === "text" && (
              <SurfaceTextEditor
                key="text-editor"
                node_id={content_edit_mode.node_id}
              />
            )}
          </SurfaceGroup>

          {/* surfaces with performance considerations */}
          <SurfaceGroup
            hidden={
              is_transforming ||
              is_node_transforming ||
              is_node_translating ||
              is_window_resizing
            }
            dontRenderWhenHidden
          >
            {content_edit_mode?.type === "vector" && (
              <SurfaceVectorEditor
                key="vector-geometry-editor"
                node_id={content_edit_mode.node_id}
              />
            )}
            {content_edit_mode?.type === "paint/gradient" && (
              <SurfaceGradientEditor
                key="gradient-editor"
                node_id={content_edit_mode.node_id}
              />
            )}
          </SurfaceGroup>

          {/* surfaces relatively cheap */}
          <SurfaceGroup hidden={is_window_resizing}>
            {content_edit_mode?.type === "paint/image" && (
              <SurfaceImageEditor
                key="image-editor"
                node_id={content_edit_mode.node_id}
              />
            )}
            {content_edit_mode?.type === "width" && (
              <SurfaceVariableWidthEditor
                key="varwidth-editor"
                node_id={content_edit_mode.node_id}
              />
            )}
          </SurfaceGroup>

          <SurfaceGroup
            hidden={
              is_transforming ||
              is_window_resizing ||
              content_edit_mode?.type === "vector"
            }
          >
            <SelectionOverlay
              selection={selection}
              readonly={!!content_edit_mode}
            />
          </SurfaceGroup>
          <SurfaceGroup
            hidden={is_window_resizing || content_edit_mode?.type === "vector"}
          >
            <SurfaceGroup
              hidden={tool.type !== "cursor" || is_node_transforming}
            >
              {hovered_node_id && (
                // general hover
                <NodeOverlay node_id={hovered_node_id} readonly />
              )}
            </SurfaceGroup>
          </SurfaceGroup>
          {dropzone && <DropzoneOverlay {...dropzone} />}
          <RootFramesBarOverlay />
        </div>
      </div>
    </SurfaceSelectionGroupProvider>
  );
}

function FollowingFrameOverlay() {
  const instance = useCurrentEditor();
  const { isFollowing, cursor: cursorId } = useFollowPlugin(
    instance.surface.__pligin_follow
  );

  const cursor = useEditorState(instance, (state) => {
    if (!cursorId) return undefined;
    return state.cursors[cursorId];
  });

  const stop = React.useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      instance.surface.unfollow();
    },
    [instance]
  );

  if (!isFollowing || !cursor) return null;

  return (
    <div
      className="absolute inset-1.5 rounded-2xl z-50 pointer-events-auto border-2 overflow-hidden"
      style={{ borderColor: cursor.palette["500"] }}
      onPointerDown={stop}
      onWheel={stop}
    >
      <div
        className="absolute top-0 right-0 px-3 py-1 rounded-bl-2xl text-xs"
        style={{
          background: cursor.palette["500"],
          color: cursor.palette["100"],
        }}
      >
        <button onClick={stop}>Stop following</button>
      </div>
    </div>
  );
}

function RemoteCursorOverlay() {
  const cursors = useMultiplayerCursorState();
  const { transform } = useTransformState();

  const cursorArray = Object.values(cursors);
  if (!cursorArray.length) return null;
  return (
    <>
      {cursorArray.map((c) => {
        const pos = cmath.vector2.transform(c.position, transform);
        return (
          <React.Fragment key={c.id}>
            <FakeCursorPosition x={pos[0]} y={pos[1]}>
              <FakeForeignCursor
                color={{
                  fill: c.palette["400"],
                  hue: c.palette["100"],
                }}
                name={"Anonymous"}
                message={c.ephemeral_chat?.txt}
              />
            </FakeCursorPosition>
            {c.marquee && (
              <MarqueeArea
                a={cmath.vector2.transform(c.marquee.a, transform)}
                b={cmath.vector2.transform(c.marquee.b, transform)}
                color={{
                  hue: c.palette["500"],
                  fill: `color-mix(in oklch, ${c.palette["400"]} 10%, transparent)`,
                }}
              />
            )}
            {c.selection?.map((node_id) => (
              <NodeOverlay
                key={node_id}
                node_id={node_id}
                readonly
                borderWidth={2}
                borderColor={c.palette["400"]}
              />
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
}

function MarqueeOverlay() {
  const editor = useCurrentEditor();
  const marquee = useEditorState(editor, (state) => state.marquee);
  const { transform } = useTransformState();

  if (!marquee) return null;
  return (
    <div id="marquee-container" className="absolute top-0 left-0 w-0 h-0">
      <MarqueeArea
        a={cmath.vector2.transform(marquee.a, transform)}
        b={cmath.vector2.transform(marquee.b, transform)}
      />
    </div>
  );
}

function LassoOverlay() {
  const editor = useCurrentEditor();
  const lasso = useEditorState(editor, (state) => state.lasso);
  const { transform } = useTransformState();

  if (!lasso) return null;
  const points = lasso.points.map((p) => cmath.vector2.transform(p, transform));
  return <Lasso points={points} id="lasso-container" className="fixed" />;
}

function DropzoneOverlay(props: editor.state.DropzoneIndication) {
  const { transform } = useTransformState();
  switch (props.type) {
    case "node":
      return <NodeOverlay node_id={props.node_id} readonly />;
    case "rect":
      const r = cmath.rect.transform(props.rect, transform);
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

function RootFramesBarOverlay() {
  const { selection, hovered_node_id } = useSelectionState();
  const { document } = useDocumentState();
  const scene = useCurrentSceneState();
  const rootframes = useMemo(() => {
    const children = scene.children_refs.map((id) => document.nodes[id]);
    return children.filter(
      (n) =>
        n.type === "container" ||
        n.type === "template_instance" ||
        n.type === "component" ||
        n.type === "instance"
    );
  }, [scene.children_refs, document.nodes]);

  if (scene.constraints.children === "single") {
    const rootframe = rootframes[0];
    if (!rootframe) return null;
    return (
      <NodeTitleBar
        node={rootframe}
        node_id={rootframe.id}
        state={"active"}
        sideOffset={8}
      >
        <FloatingBarContent>
          <NodeTitleBarTitle node={rootframe}>
            {" (single mode)"}
          </NodeTitleBarTitle>
        </FloatingBarContent>
      </NodeTitleBar>
    );
  }

  return (
    <>
      {rootframes.map((node) => (
        <NodeTitleBar
          key={node.id}
          node={node}
          node_id={node.id}
          state={
            selection.includes(node.id)
              ? "active"
              : hovered_node_id === node.id
                ? "hover"
                : "idle"
          }
        >
          <NodeTitleBarTitle node={node} />
        </NodeTitleBar>
      ))}
    </>
  );
}

function NodeTitleBar({
  node,
  node_id,
  state,
  sideOffset,
  children,
}: React.PropsWithChildren<{
  node: grida.program.nodes.Node;
  sideOffset?: number;
  node_id: string;
  state: "idle" | "hover" | "active";
}>) {
  const editor = useCurrentEditor();

  // TODO: knwon issue: when initially firing up the drag on not-selected node, it will cause the root to fire onDragEnd as soon as the drag starts.
  const bind = useSurfaceGesture(
    {
      // TODO: this is required to make the node stays focused, as as soon as pointer moves, the editor will be calling its own on pointer move, causing empty hit testing, cancelling the hover.
      // but whith this enabled, it will re-render every time. making the react's rendering very slow.
      // need a graceful way to handle this.
      // DISABLED: disabled for now, because keep-hovering when hovering on title bar is not a critical feature.
      // onPointerMove: () => {
      //   editor.hoverEnterNode(node.id);
      // },
      onPointerEnter: () => {
        editor.surface.surfaceHoverEnterNode(node.id);
      },
      onPointerLeave: () => {
        editor.surface.surfaceHoverLeaveNode(node.id);
      },
      onPointerDown: ({ event }) => {
        event.preventDefault();
        if (event.shiftKey) {
          editor.commands.select("selection", [node.id]);
        } else {
          editor.commands.select([node.id]);
        }
      },
    },
    {
      drag: {
        threshold: DRAG_THRESHOLD,
      },
    }
  );

  return (
    <FloatingBar
      node_id={node_id}
      state={state}
      sideOffset={sideOffset}
      isComponentConsumer={is_direct_component_consumer(node.type)}
    >
      <div {...bind()} style={{ touchAction: "none" }}>
        {children}
      </div>
    </FloatingBar>
  );
}

function NodeTitleBarTitle({
  node,
  children,
}: React.PropsWithChildren<{
  node: grida.program.nodes.Node;
}>) {
  const editor = useCurrentEditor();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(node.name);
  }, [node.name]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const name = value.trim();
    if (name && name !== node.name) {
      editor.doc.getNodeById(node.id).name = name;
    }
    setEditing(false);
  };

  const cancel = () => {
    setValue(node.name);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="max-w-full w-min pointer-events-auto text-xs truncate text-muted-foreground/65 bg-transparent outline-none"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
      />
    );
  }

  return (
    <FloatingBarTitle
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {node.name}
      {children}
    </FloatingBarTitle>
  );
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
  const { gesture } = useGestureState();
  const { transform } = useTransformState();
  const pointer = usePointerState();
  const pos = cmath.vector2.transform(pointer.position, transform);
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
        <div className="bg-pink-500 text-white text-xs px-1 py-0.5 rounded-sm shadow">
          {value}
        </div>
      </div>
    );
  }
}

function BrushCursor({ brush }: { brush: BitmapEditorBrush }) {
  const { transform, scaleX, scaleY } = useTransformState();
  const pointer = usePointerState();
  const pos = cmath.vector2.transform(
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

function get_cursor_tooltip_value(gesture: editor.gesture.GestureState) {
  switch (gesture.type) {
    case "gap":
      return cmath.ui.formatNumber(gesture.gap, 1);
    case "padding":
      return cmath.ui.formatNumber(gesture.padding, 1);
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
  const editor = useCurrentEditor();
  const { gesture, is_node_translating } = useGestureState();
  const { scaleX, scaleY } = useTransformState();
  const data = useSingleSelection(node_id);
  if (!data) return <></>;

  const { node, distribution, rotation, boundingSurfaceRect, size, object } =
    data;

  // Get padding if this is a container
  const padding =
    node.type === "container" && "padding" in node ? node.padding : undefined;

  // Calculate measurement rect for visibility checks
  const measurement_rect = {
    x: 0,
    y: 0,
    width: size[0] * scaleX,
    height: size[1] * scaleY,
  };

  const show_gap_overlay =
    measurement_rect.width >= MIN_NODE_OVERLAY_GAP_VISIBLE_UI_SIZE &&
    measurement_rect.height >= MIN_NODE_OVERLAY_GAP_VISIBLE_UI_SIZE;

  const show_padding_overlay =
    measurement_rect.width >= MIN_NODE_OVERLAY_PADDING_VISIBLE_UI_SIZE &&
    measurement_rect.height >= MIN_NODE_OVERLAY_PADDING_VISIBLE_UI_SIZE;

  return (
    <>
      <div className="group">
        <SurfaceFragmentGroup hidden={is_node_translating}>
          <NodeOverlay node_id={node_id} readonly={readonly} focused>
            {node.meta.is_flex_parent &&
              distribution &&
              (gesture.type === "idle" ||
                gesture.type === "gap" ||
                gesture.type === "padding") &&
              // TODO: support rotated surface
              rotation === 0 && (
                <>
                  {show_gap_overlay && (
                    <GapOverlay
                      offset={[boundingSurfaceRect.x, boundingSurfaceRect.y]}
                      distribution={distribution}
                      onGapGestureStart={(axis) => {
                        editor.surface.surfaceStartGapGesture(node_id, axis);
                      }}
                    />
                  )}
                  {show_padding_overlay && padding !== undefined && (
                    <PaddingOverlay
                      offset={[boundingSurfaceRect.x, boundingSurfaceRect.y]}
                      containerRect={object.boundingRect}
                      padding={
                        typeof padding === "number"
                          ? {
                              top: padding,
                              right: padding,
                              bottom: padding,
                              left: padding,
                            }
                          : {
                              top: padding.padding_top,
                              right: padding.padding_right,
                              bottom: padding.padding_bottom,
                              left: padding.padding_left,
                            }
                      }
                      onPaddingGestureStart={(side) => {
                        editor.surface.surfaceStartPaddingGesture(
                          node_id,
                          side
                        );
                      }}
                    />
                  )}
                </>
              )}
          </NodeOverlay>
        </SurfaceFragmentGroup>
      </div>
    </>
  );
}

function MultpleSelectionGroupsOverlay({ readonly }: { readonly?: boolean }) {
  const editor = useCurrentEditor();
  const { gesture, is_node_translating } = useGestureState();
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
                  editor.surface.surfaceStartGapGesture(g.ids, axis);
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
  const editor = useCurrentEditor();
  const tool = useToolState();

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
        editor.surface.surfaceMultipleSelectionOverlayClick(ids, e.event);
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
        <LayerOverlayResizeSide anchor="n" selection={ids} />
        <LayerOverlayResizeSide anchor="s" selection={ids} />
        <LayerOverlayResizeSide anchor="e" selection={ids} />
        <LayerOverlayResizeSide anchor="w" selection={ids} />
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
            editor.commands.distributeEvenly("selection", axis);
          }}
        />
        {boundingSurfaceRect && (
          <SizeMeterLabel
            offset={16}
            size={size}
            rect={{ ...boundingSurfaceRect, x: 0, y: 0 }}
            className="bg-workbench-accent-sky group-data-[layer-is-component-consumer='true']:bg-workbench-accent-violet text-white"
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
  borderColor,
  borderWidth,
  children,
}: React.PropsWithChildren<{
  node_id: string;
  readonly?: boolean;
  zIndex?: number;
  focused?: boolean;
  borderColor?: string;
  borderWidth?: number;
}>) {
  const { scaleX, scaleY } = useTransformState();
  const backend = useBackendState();
  const tool = useToolState();

  // enable overlay dragging only when the cursor tool is active and editable
  const enabled = !readonly && tool.type === "cursor";

  const bind = useSurfaceGesture(
    {
      // FIXME: need better event handling - completely remove this in the future, use bbh query to handle the logic, purely mathmatical without binding events to this.
      // basically, below block is required to prevent the current selection from de-selecting, when user tries to drag it.
      // but this causes,
      // 1. the ui (input) to not blur from panel
      // 2. the inner content from being selected
      onPointerDown: ({ event }) => {
        if (
          tool.type !== "insert" &&
          tool.type !== "draw" &&
          !event.shiftKey &&
          !event.metaKey
        ) {
          // prevent default to keep selection when clicking empty overlay
          // but allow shift+click to fall through for deselection
          event.preventDefault();

          // blur inputs manually
          try {
            (document.activeElement as HTMLInputElement)?.blur();
          } catch {}
        }
      },
    },
    { enabled }
  );

  const data = useSingleSelection(node_id);

  if (!data) return <></>;

  const { node, style, size } = data;

  const { is_component_consumer, is_flex_parent } = node.meta;
  // readonly = readonly || is_component_consumer;

  const measurement_rect = {
    x: 0,
    y: 0,
    width: size[0] * scaleX,
    height: size[1] * scaleY,
  };

  const show_corner_radius_handle =
    measurement_rect.width >= MIN_NODE_OVERLAY_CORNER_RADIUS_VISIBLE_UI_SIZE &&
    measurement_rect.height >= MIN_NODE_OVERLAY_CORNER_RADIUS_VISIBLE_UI_SIZE;

  // TODO: resize for bitmap is not supported */
  const is_resizable_node = node.type !== "bitmap";

  return (
    <>
      <LayerOverlay
        {...bind()}
        readonly={readonly}
        transform={style}
        zIndex={zIndex}
        isComponentConsumer={is_component_consumer}
        borderColor={borderColor}
        borderWidth={borderWidth}
      >
        {focused && !readonly && (
          <>
            {is_resizable_node && (
              <>
                {node.type === "line" ? (
                  <>
                    <LayerOverlayResizeSide anchor="e" selection={node_id} />
                    <LayerOverlayResizeSide anchor="w" selection={node_id} />
                    <LayerOverlayResizeHandle anchor="e" selection={node_id} />
                    <LayerOverlayResizeHandle anchor="w" selection={node_id} />
                  </>
                ) : (
                  <>
                    <LayerOverlayResizeSide anchor="n" selection={node_id} />
                    <LayerOverlayResizeSide anchor="s" selection={node_id} />
                    <LayerOverlayResizeSide anchor="e" selection={node_id} />
                    <LayerOverlayResizeSide anchor="w" selection={node_id} />
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
              </>
            )}
            {show_corner_radius_handle &&
              supports.cornerRadius(node.type, { backend }) &&
              !supports.children(node.type, { backend }) &&
              (supports.cornerRadius4(node.type, { backend }) ? (
                <NodeOverlayRectangularCornerRadiusHandles node_id={node_id} />
              ) : (
                <NodeOverlayCornerRadiusHandle node_id={node_id} anchor="se" />
              ))}
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
            className="bg-workbench-accent-sky group-data-[layer-is-component-consumer='true']:bg-workbench-accent-violet text-white"
          />
        )}
        {children}
      </LayerOverlay>
    </>
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
  const editor = useCurrentEditor();

  const rotation = editor.getNodeAbsoluteRotation(node_id);

  const bind = useSurfaceGesture({
    onDragStart: ({ event }) => {
      event.preventDefault();
      editor.surface.surfaceStartRotateGesture(node_id);
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
  const editor = useCurrentEditor();

  const zIndex = ["n", "e", "s", "w"].includes(anchor) ? 11 : 21;

  const bind = useSurfaceGesture({
    onPointerDown: ({ event }) => {
      event.preventDefault();
    },
    onDragStart: ({ event }) => {
      event.preventDefault();
      editor.surface.surfaceStartScaleGesture(selection, anchor);
    },
  });

  return <Knob size={size} {...bind()} anchor={anchor} zIndex={zIndex} />;
}

function LayerOverlayResizeSide({
  selection,
  anchor,
  thickness = 8,
}: {
  selection: string | string[];
  anchor: "n" | "e" | "s" | "w";
  thickness?: number;
}) {
  const editor = useCurrentEditor();

  const bind = useSurfaceGesture(
    {
      onPointerDown: ({ event }) => {
        event.preventDefault();
      },
      onDragStart: ({ event }) => {
        event.preventDefault();
        editor.surface.surfaceStartScaleGesture(selection, anchor);
      },
      onDoubleClick: ({ event }) => {
        event.preventDefault();
        event.stopPropagation();

        // feat: text-node-auto-size
        if (
          typeof selection === "string" &&
          editor.commands.getNodeSnapshotById(selection)?.type === "text"
        ) {
          const axis = anchor === "e" || anchor === "w" ? "width" : "height";
          editor.autoSizeTextNode(selection, axis);
        }
      },
    },
    {
      drag: {
        threshold: DRAG_THRESHOLD,
        keyboardDisplacement: 0,
      },
    }
  );

  const offset = thickness / 2;

  const positionalStyle: React.CSSProperties =
    anchor === "n" || anchor === "s"
      ? {
          left: 0,
          right: 0,
          height: thickness,
          top: anchor === "n" ? -offset : undefined,
          bottom: anchor === "s" ? -offset : undefined,
        }
      : {
          top: 0,
          bottom: 0,
          width: thickness,
          left: anchor === "w" ? -offset : undefined,
          right: anchor === "e" ? -offset : undefined,
        };

  return (
    <div
      {...bind()}
      style={{
        position: "absolute",
        background: "transparent",
        cursor: cursors.resize_handle_cursor_map[anchor],
        touchAction: "none",
        zIndex: 20,
        ...positionalStyle,
      }}
    />
  );
}

function NetworkOverlay({ transform }: { transform: cmath.Transform }) {
  const { edges } = useCurrentSceneState();
  return (
    <>
      {edges?.map((edge) => {
        return <Edge key={edge.id} transform={transform} {...edge} />;
      })}
    </>
  );
}

function Edge({
  id,
  a,
  b,
  transform,
}: grida.program.document.Edge2D & {
  transform: cmath.Transform;
}) {
  // normalize a/b to surface space position
  const editor = useCurrentEditor();

  const get_pos = (p: grida.program.document.EdgePoint) => {
    switch (p.type) {
      case "position":
        return cmath.vector2.transform([p.x, p.y], transform);
      case "anchor":
        try {
          const n = editor.commands.getNodeSnapshotById(p.target);
          const cx = (n as any).left + (n as any).width / 2;
          const cy = (n as any).top + (n as any).height / 2;
          return cmath.vector2.transform([cx, cy], transform);
        } catch (e) {}
    }
  };

  const _a = get_pos(a);
  const _b = get_pos(b);
  if (!_a || !_b) return null;

  return <BezierCurvedLine id={id} a={_a} b={_b} />;
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
  const editor = useCurrentEditor();
  const bind = useSurfaceGesture({
    onPointerDown: ({ event }) => {
      event.preventDefault();
    },
    onDragStart: ({ event }) => {
      event.preventDefault();
      editor.surface.surfaceStartSortGesture(selection, node_id);
    },
  });

  return <RedDotHandle {...bind()} />;
}

function PixelGridOverlay() {
  const editor = useCurrentEditor();
  const transform = useEditorState(editor, (state) => state.transform);
  const scaleX = transform[0][0];

  const viewport = useViewport();
  return (
    <div role="pixel-grid" className="fixed inset-0 pointer-events-none">
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
  const editor = useCurrentEditor();
  const { guides = [] } = useCurrentSceneState();
  const { scaleX, scaleY, transform } = useTransformState();
  const viewport = useViewport();
  const d = useSurfaceSelectionGroups();

  const bindX = useSurfaceGesture({
    onDragStart: ({ event }) => {
      editor.surface.surfaceStartGuideGesture("y", -1);
      event.preventDefault();
    },
  });

  const bindY = useSurfaceGesture({
    onDragStart: ({ event }) => {
      editor.surface.surfaceStartGuideGesture("x", -1);
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
      <RulerContextMenu editor={editor}>
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
      </RulerContextMenu>
      <RulerContextMenu editor={editor}>
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
      </RulerContextMenu>
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

function RulerContextMenu({
  editor,
  children,
}: {
  editor: ReturnType<typeof useCurrentEditor>;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          className="text-xs"
          onSelect={() => {
            editor.surface.surfaceConfigureRuler("off");
            toast.success("Ruler off");
          }}
        >
          Hide ruler
          <ContextMenuShortcut>⇧R</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function Guide({
  axis,
  offset,
  idx,
}: grida.program.document.Guide2D & { idx: number }) {
  const editor = useCurrentEditor();
  const { transform } = useTransformState();
  const o = cmath.delta.transform(offset, axis, transform);
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
        editor.commands.deleteGuide(idx);
      }
      if (event.key === "Escape") {
        (event.currentTarget as HTMLElement)?.blur();
      }
      event.stopPropagation();
    },
    onDragStart: ({ event }) => {
      editor.surface.surfaceStartGuideGesture(axis, idx);
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
