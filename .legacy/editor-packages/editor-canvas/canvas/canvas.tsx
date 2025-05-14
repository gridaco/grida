import React, { useEffect, useRef, useState, useMemo } from "react";
import { CanvasStateStore } from "../stores";
import {
  CanvasEventTarget,
  OnPanningHandler,
  OnZoomingHandler,
  OnPointerMoveHandler,
  OnPointerDownHandler,
  OnDragHandler,
} from "../canvas-event-target";
import {
  target_of_point,
  centerOf,
  edge_scrolling,
  target_of_area,
  boundingbox,
  is_point_inside_box,
  zoomToFit,
} from "../math";
import q from "@design-sdk/query";
import { LazyFrame } from "../lazy-frame";
import { DisplayNodeMeta, HudCustomRenderers, HudSurface } from "../hud";
import type { Box, XY, CanvasTransform, XYWH, XYWHR, X1Y1X2Y2 } from "../types";
import type { FrameOptimizationFactors } from "../frame";
// import { TransformDraftingStore } from "../drafting";
import {
  CANVAS_LAYER_HOVER_HIT_MARGIN,
  CANVAS_INITIAL_XY,
  CANVAS_INITIAL_SCALE,
  CANVAS_MIN_ZOOM,
} from "../k";
import {
  ContextMenuRoot as ContextMenu,
  MenuItem,
} from "@editor-ui/context-menu";
import styled from "@emotion/styled";
import toast from "react-hot-toast";
import type { ResizeHandleOrigin } from "../overlay/types";

interface TCanvasNode extends DisplayNodeMeta {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  absoluteX: number;
  absoluteY: number;
  rotation?: number;
  children?: TCanvasNode[];
  parent?: TCanvasNode;
}

interface CanvasState<T extends TCanvasNode> {
  pageid: string;
  filekey: string;
  backgroundColor?: React.CSSProperties["backgroundColor"];
  nodes: T[];
  highlightedLayer?: string;
  selectedNodes: string[];
  readonly?: boolean;
  /**
   * displays the debug info on the canvas.
   */
  debug?: boolean;
  /**
   * when provided, it will override the saved value or centering logic and use this transform as initial instead.
   *
   * Canvas automatically saves the last transform and also automatically calculates the initial transform based on the input's complexity.
   *
   * @default undefined
   */
  initialTransform?: CanvasTransform;
}

type CanvasCustomRenderers<T extends TCanvasNode> = HudCustomRenderers<T> & {
  renderItem: (
    p: {
      node: T;
    } & FrameOptimizationFactors
  ) => React.ReactNode;
};

interface CanvsPreferences {
  can_highlight_selected_layer?: boolean;
  marquee: MarqueeOprions;
  grouping: GroupingOptions;
}

interface MarqueeOprions {
  /**
   * disable marquee - events and selection with dragging.
   *
   * @default false
   */
  disabled?: boolean;
}

interface GroupingOptions {
  /**
   * disable grouping - multiple selections will not be grouped.
   * @default false
   **/
  disabled?: boolean;
}

type Cursor = React.CSSProperties["cursor"];

interface CanvasCursorOptions {
  cursor?: Cursor;
}

const default_canvas_preferences: CanvsPreferences = {
  can_highlight_selected_layer: false,
  marquee: {
    disabled: false,
  },
  grouping: {
    disabled: false,
  },
};

type CanvasProps<T extends TCanvasNode> = CanvasFocusProps &
  CanvasCursorOptions & {
    /**
     * canvas view bound.
     * [(x1) left, (y1) top, (x2) right, (y2) bottom]
     */
    viewbound: Box;
    onSelectNode?: (...node: TCanvasNode[]) => void;
    onMoveNodeStart?: (...node: string[]) => void;
    onMoveNode?: (delta: XY, ...node: string[]) => void;
    onMoveNodeEnd?: (delta: XY, ...node: string[]) => void;
    onResizeNode?: (
      delta: XY,
      meta: {
        origin: ResizeHandleOrigin;
        shiftKey: boolean;
        altKey: boolean;
      },
      ...node: string[]
    ) => void;
    onClearSelection?: () => void;
  } & CanvasCustomRenderers<T> &
  CanvasState<T> & {
    config?: CanvsPreferences;
  };

type CanvasFocusProps = {
  /**
   * IDs of focus nodes.
   *
   * @default []
   */
  focus?: string[];
  focusRefreshkey?: string;
};

type CanvasFocusSnap = {
  damping?: number;
  bounds?: Box;
};

interface HovringNode {
  node: TCanvasNode;
  reason: "frame-title" | "raycast" | "external";
}

function xywhr_of(node: TCanvasNode): XYWHR {
  return [
    node.absoluteX,
    node.absoluteY,
    node.width,
    node.height,
    node.rotation,
  ] as XYWHR;
}

export function Canvas<T extends TCanvasNode>({
  viewbound,
  renderItem,
  onMoveNodeStart,
  onMoveNode,
  onMoveNodeEnd,
  onSelectNode: _cb_onSelectNode,
  onResizeNode: _cb_onResizeNode,
  onClearSelection,
  filekey,
  pageid,
  nodes,
  focus = [],
  focusRefreshkey: focusRefreshKey,
  initialTransform,
  highlightedLayer,
  selectedNodes,
  debug,
  readonly = true,
  config = default_canvas_preferences,
  backgroundColor,
  cursor: _cursor,
  ...props
}: CanvasProps<T>) {
  const viewboundmeasured = useMemo(
    () => !viewbound_not_measured(viewbound),
    viewbound
  );

  useEffect(() => {
    if (transformIntitialized) {
      return;
    }

    const _last_knwon = _canvas_state_store.getLastTransform();
    if (_last_knwon) {
      setZoom(_last_knwon.scale);
      setOffset(_last_knwon.xy);
      setTransformInitialized(true);
      return;
    }

    if (!viewboundmeasured) {
      return;
    }

    const t = auto_initial_transform(viewbound, nodes);
    setZoom(t.scale);
    setOffset(t.xy);
    setTransformInitialized(true);
  }, [viewbound]);

  useEffect(() => {
    // change the canvas transform to visually fit the focus nodes.

    if (!viewboundmeasured) {
      return;
    }

    if (focus.length == 0) {
      return;
    }

    // TODO: currently only the root nodes are supported to be focused.
    const _focus_nodes = nodes.filter((n) => focus.includes(n.id));
    if (_focus_nodes.length == 0) {
      return;
    }

    const _focus_center = centerOf(
      viewbound,
      200,
      ..._focus_nodes.map((n) => ({
        x: n.absoluteX,
        y: n.absoluteY,
        width: n.width,
        height: n.height,
        rotation: n.rotation ?? 0,
      }))
    );

    setOffset(_focus_center.translate);
    setZoom(_focus_center.scale);
  }, [...focus, focusRefreshKey, viewboundmeasured]);

  const [cursor, setCursor] = useState<Cursor>(_cursor);
  const [transformIntitialized, setTransformInitialized] =
    useState(!!initialTransform);
  const [zoom, setZoom] = useState(initialTransform?.scale || 1);
  const [isZooming, setIsZooming] = useState(false);
  const [offset, setOffset] = useState<[number, number]>(
    initialTransform?.xy || [0, 0]
  );
  const nonscaled_offset: XY = offset
    ? [offset[0] / zoom, offset[1] / zoom]
    : [0, 0];
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMovingSelections, setIsMovingSelections] = useState(false);
  const [isResizingSelections, setIsResizingSelections] = useState(false);
  const [marquee, setMarquee] = useState<XYWH | null>(null);

  const _canvas_state_store = useMemo(
    () => new CanvasStateStore(filekey, pageid),
    [filekey, pageid]
  );

  const cvtransform: CanvasTransform = {
    scale: zoom,
    xy: offset,
  };

  const qdoc = useMemo(() => q.document(nodes), [nodes]);

  const node = (id) => qdoc.getNodeById(id);

  const onSelectNode = (...nodes: TCanvasNode[]) => {
    _cb_onSelectNode?.(...nodes.filter(Boolean));
  };

  const wshighlight = highlightedLayer
    ? ({ node: node(highlightedLayer), reason: "external" } as HovringNode)
    : null;

  const [hoveringLayer, setHoveringLayer] = useState<HovringNode | null>(
    wshighlight
  );

  useEffect(() => {
    setHoveringLayer(wshighlight);
  }, [highlightedLayer]);

  // cursor change effect
  useEffect(() => {
    if (isMovingSelections) {
      setCursor("grab");
    } else {
      setCursor(_cursor);
    }
  }, [isMovingSelections]);

  // area selection hook
  useEffect(() => {
    if (marquee) {
      const area: XYWH = [
        marquee[0] / zoom,
        marquee[1] / zoom,
        marquee[2] / zoom,
        marquee[3] / zoom,
      ];

      const selections = target_of_area({
        area,
        tree: nodes,
        contain: false,
      });

      // https://stackoverflow.com/a/19746771
      const same =
        selectedNodes.length === selections?.length &&
        selectedNodes.every((value, index) => value === selections[index].id);

      if (!same) {
        onSelectNode?.(...selections);
      }
    }
    //
  }, [marquee]);

  const onPointerMove: OnPointerMoveHandler = (state) => {
    if (isPanning || isZooming || isDragging) {
      // don't perform hover calculation while transforming.
      return;
    }
    const hovering = target_of_point({
      point: state.xy,
      tree: nodes,
      zoom: zoom,
      offset: nonscaled_offset,
      margin: CANVAS_LAYER_HOVER_HIT_MARGIN,
      reverse: true,
      // ignore: (n) => selectedNodes.includes(n.id),
    });

    if (!hovering) {
      if (
        hoveringLayer &&
        hoveringLayer.node &&
        hoveringLayer.reason === "frame-title"
      ) {
        // skip
      } else {
        setHoveringLayer(null);
      }
    } else {
      setHoveringLayer({ node: hovering, reason: "raycast" });
    }
  };

  const onPointerDown: OnPointerDownHandler = (state) => {
    const [x, y] = [state.event.clientX, state.event.clientY];

    const isPanningStarting = state.event.button === 1; // middle click

    if (isPanningStarting || isPanning || isZooming) {
      return;
    }

    if (!readonly && shouldStartMoveSelections([x, y])) {
      return; // don't do anything. onDrag will handle this. only block the event.
    }

    if (hoveringLayer) {
      switch (hoveringLayer.reason) {
        case "frame-title":
        case "raycast":
          onSelectNode?.(hoveringLayer.node);
          break;
      }
    } else {
      onClearSelection?.();
    }
  };

  const onPanning: OnPanningHandler = (s) => {
    const {
      delta: [x, y],
      wheeling,
    } = s;

    setOffset([offset[0] - x, offset[1] - y]);
  };

  const onZooming: OnZoomingHandler = (state) => {
    // TODO: pinch delta is not consistent. - https://github.com/pmndrs/use-gesture/issues/435

    const zoomdelta = state.delta[0];
    // the origin point of the zooming point in x, y
    const [ox, oy]: XY = state.origin;

    const newzoom = Math.max(zoom + zoomdelta, CANVAS_MIN_ZOOM);

    // calculate the offset that should be applied with scale with css transform.
    const [newx, newy] = [
      ox - (ox - offset[0]) * (newzoom / zoom),
      oy - (oy - offset[1]) * (newzoom / zoom),
    ];

    setZoom(newzoom);
    setOffset([newx, newy]);
  };

  const onDragStart: OnDragHandler = (s) => {
    setIsDragging(true);

    // set the marquee start point
    const [x, y] = s.initial;
    const [ox, oy] = offset;
    const [x1, y1] = [x - ox, y - oy];

    // if dragging a selection group bounding box, move the selected items.
    if (!readonly && shouldStartMoveSelections([x, y])) {
      setIsMovingSelections(true);
      onMoveNodeStart?.(...selectedNodes);
      return;
    }

    // else, clear and start a marquee
    onClearSelection?.();
    setHoveringLayer(null);
    setMarquee([x1, y1, 0, 0]);
  };

  const shouldStartMoveSelections = ([cx, cy]) => {
    // x, y is a client x, y.
    const [ox, oy] = offset;
    [cx, cy] = [cx - ox, cy - oy];
    const [x, y] = [cx / zoom, cy / zoom];

    const box = boundingbox(
      selected_nodes.map((d) => xywhr_of(d!)),
      2
    );

    return is_point_inside_box([x, y], box);
  };

  const onDrag: OnDragHandler = (s) => {
    const [ox, oy] = offset;
    const [x, y] = [
      // @ts-ignore
      s.event.clientX,
      // @ts-ignore
      s.event.clientY,
    ];

    const [x1, y1] = [x - ox, y - oy];

    if (isMovingSelections) {
      const [dx, dy] = s.delta;
      onMoveNode?.([dx / zoom, dy / zoom], ...selectedNodes);
    }

    if (config.marquee.disabled) {
      // skip
    } else {
      // edge scrolling
      // edge scrolling is only enabled when config#marquee is enabled
      const [cx, cy] = [x, y];
      const [dx, dy] = edge_scrolling(cx, cy, viewbound);
      if (dx || dy) {
        setOffset([ox + dx, oy + dy]);
      }

      // update marquee & following selections via effect
      if (marquee) {
        const [w, h] = [
          x1 - marquee[0], // w
          y1 - marquee[1], // h
        ];
        setMarquee([marquee[0], marquee[1], w, h]);
      }
    }
  };

  const onDragEnd: OnDragHandler = (s) => {
    setMarquee(null);
    setIsDragging(false);
    if (isMovingSelections) {
      const [ix, iy] = s.initial;
      const [fx, fy] = [
        //@ts-ignore
        s.event.clientX,
        //@ts-ignore
        s.event.clientY,
      ];

      onMoveNodeEnd?.([(fx - ix) / zoom, (fy - iy) / zoom], ...selectedNodes);
      setHoveringLayer(null);
      setIsMovingSelections(false);
    }
  };

  const is_canvas_transforming = isPanning || isZooming;

  const hud_hidden =
    is_canvas_transforming || isMovingSelections || isResizingSelections;

  const hud_interaction_disabled = is_canvas_transforming || isMovingSelections;

  const selected_nodes: T[] = useMemo(
    () =>
      selectedNodes?.map((id) => qdoc.getNodeById(id)).filter(Boolean) as T[],
    [selectedNodes, isDragging, hud_hidden]
  );

  const position_guides = useMemo(
    () =>
      position_guide({
        selections: selected_nodes,
        hover: hoveringLayer?.node,
      }),
    [selectedNodes, hoveringLayer?.node?.id, hud_hidden]
  );

  const highlights = useMemo(() => {
    return hoveringLayer?.node
      ? (config.can_highlight_selected_layer
          ? [hoveringLayer.node]
          : noduplicates([hoveringLayer.node], selected_nodes)
        ).map((h) => ({
          id: h.id,
          xywh: [h.absoluteX, h.absoluteY, h.width, h.height] as XYWH,
          rotation: h.rotation,
        }))
      : [];
  }, [hoveringLayer, selectedNodes, hud_hidden]);

  const items = useMemo(() => {
    return nodes?.map((node) => {
      return (
        <LazyFrame key={node.id} xy={[node.x, node.y]} size={node}>
          {/* 👇 dev only (for performance tracking) 👇 */}
          {/* <div style={{ width: "100%", height: "100%", background: "grey" }} /> */}
          {/* 👆 ----------------------------------- 👆 */}
          {renderItem({
            node: node,
            zoom, // ? use scaled_zoom ?
            inViewport: true, // TODO:
            isZooming: isZooming,
            isPanning: isPanning,
            focused: selectedNodes.includes(node.id),
          })}
        </LazyFrame>
      );
    });
  }, [nodes, selectedNodes, isZooming, isPanning]);

  if (!transformIntitialized) {
    return <></>;
  }

  return (
    <>
      <>
        {debug === true && (
          <Debug
            infos={[
              { label: "zoom", value: zoom },
              { label: "offset", value: offset.join(", ") },
              { label: "isPanning", value: isPanning },
              { label: "isZooming", value: isZooming },
              { label: "isDragging", value: isDragging },
              { label: "isMovingSelections", value: isMovingSelections },
              { label: "isTransforming", value: is_canvas_transforming },
              { label: "selectedNodes", value: selectedNodes.join(", ") },
              { label: "hoveringLayer", value: hoveringLayer?.node?.id },
              { label: "marquee", value: marquee?.join(", ") },
              { label: "viewbound", value: viewbound.join(", ") },
              {
                label: "initial-transform (xy)",
                value: initialTransform ? initialTransform.xy.join(", ") : null,
              },
              {
                label: "initial-transform (zoom)",
                value: initialTransform ? initialTransform.scale : null,
              },
            ]}
          />
        )}
        {/* <ContextMenuProvider> */}
        <Container
          width={viewbound[2] - viewbound[0]}
          height={viewbound[3] - viewbound[1]}
        >
          <CanvasEventTarget
            onPanning={onPanning}
            onPanningStart={() => {
              setIsPanning(true);
            }}
            onPanningEnd={() => {
              setIsPanning(false);
              _canvas_state_store.saveLastTransform(cvtransform);
            }}
            onZoomToFit={() => {
              setZoom(1);
              // const newoffset = zoomToFit(viewbound, offset, zoom, 1);
              // setOffset(newoffset);
              _canvas_state_store.saveLastTransform(cvtransform);
              toast("Zoom to 100%");
            }}
            onZooming={onZooming}
            onZoomingStart={() => {
              setIsZooming(true);
            }}
            onZoomingEnd={() => {
              _canvas_state_store.saveLastTransform(cvtransform);
              setIsZooming(false);
            }}
            onPointerMove={onPointerMove}
            onPointerMoveStart={() => {}}
            onPointerMoveEnd={() => {}}
            onPointerDown={onPointerDown}
            onPointerUp={() => {
              setIsDragging(false);
              setIsMovingSelections(false);
              setIsPanning(false);
              setIsResizingSelections(false);
              setHoveringLayer(null);
            }}
            onDragStart={onDragStart}
            onDrag={onDrag}
            onDragEnd={onDragEnd}
            cursor={cursor}
          >
            <HudSurface<T>
              offset={nonscaled_offset}
              zoom={zoom}
              hidden={hud_hidden}
              disabled={hud_interaction_disabled}
              readonly={readonly}
              disableMarquee={config.marquee.disabled}
              disableGrouping={config.grouping.disabled}
              marquee={marquee}
              labelDisplayNodes={nodes}
              selectedNodes={selected_nodes}
              positionGuides={position_guides}
              highlights={highlights}
              onHoverNode={(id) => {
                setHoveringLayer({ node: node(id)!, reason: "frame-title" });
              }}
              onSelectNode={(id) => {
                onSelectNode?.(node(id)!);
              }}
              onSelectionResize={(handle, delta, { shiftKey, altKey }) => {
                // transform with zoom
                delta = [delta[0] / zoom, delta[1] / zoom];

                // cancel out unuseful delta
                if (handle == "s") delta = [0, delta[1]];
                if (handle == "n") delta = [0, delta[1]];
                if (handle == "e") delta = [delta[0], 0];
                if (handle == "w") delta = [delta[0], 0];

                _cb_onResizeNode?.(
                  delta,
                  {
                    origin: handle,
                    shiftKey,
                    altKey,
                  },
                  ...selectedNodes
                );
              }}
              onResizeStart={() => {
                setIsResizingSelections(true);
              }}
              onResizeEnd={() => {
                setIsResizingSelections(false);
              }}
              renderFrameTitle={props.renderFrameTitle}
            />
          </CanvasEventTarget>
        </Container>
        {/* </ContextMenuProvider> */}
      </>
      <CanvasBackground backgroundColor={backgroundColor} />
      <CanvasTransformRoot scale={zoom} xy={nonscaled_offset}>
        <DisableBackdropFilter>{items}</DisableBackdropFilter>
      </CanvasTransformRoot>
    </>
  );
}

const Container = styled.div<{ width: number; height: number }>`
  /* width: ${(p) => p.width}px; */
  /* height: ${(p) => p.height}px; */
`;

/**
 * 1. container positioning guide (static per selection)
 * 2. relative positioning to target (hovering layer) guide
 */
function position_guide<T extends TCanvasNode>({
  selections,
  hover,
}: {
  selections: T[];
  hover?: T;
}) {
  if (selections.length === 0) {
    return [];
  }

  const guides: {
    a: X1Y1X2Y2;
    b: X1Y1X2Y2;
  }[] = [];

  const a = boundingbox(
    selections.map((s) => xywhr_of(s)),
    2
  );

  if (hover) {
    const hover_box = boundingbox([xywhr_of(hover)], 2);

    const guide_relative_to_hover = {
      a: a,
      b: hover_box,
    };

    // if hovering layer - do not show spacing to the parent,
    // return only spacing of selection to hover
    return [guide_relative_to_hover];
  }

  if (selections.length === 1) {
    const parent = selections[0].parent;
    if (parent) {
      const parent_box = boundingbox([xywhr_of(parent)], 2);
      const guide_relative_to_parent = {
        a: a,
        b: parent_box,
      };

      guides.push(guide_relative_to_parent);
    }
  }

  return guides;
}

function ContextMenuProvider({ children }: React.PropsWithChildren<{}>) {
  const items: MenuItem<string>[] = [
    { title: "Show all layers", value: "canvas-focus-all-to-fit" },
    "separator",
    { title: "Run", value: "run" },
    { title: "Deploy", value: "deploy-to-vercel" },
    { title: "Open in Figma", value: "open-in-figma" },
    { title: "Get sharable link", value: "make-sharable-link" },
    { title: "Copy CSS", value: "make-css" },
    { title: "Refresh (fetch from origin)", value: "refresh" },
  ];

  return (
    <ContextMenu
      items={items}
      onSelect={(v) => {
        console.log("exec canvas cmd", v);
      }}
    >
      {children}
    </ContextMenu>
  );
}

function noduplicates(a: TCanvasNode[], b: TCanvasNode[]): TCanvasNode[] {
  // compare contents and return array of unique items
  return a.filter((item) => b.indexOf(item) === -1);
}

function CanvasTransformRoot({
  children,
  scale,
  xy,
}: { children: React.ReactNode } & CanvasTransform) {
  return (
    <div
      style={{
        zIndex: -1,
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        willChange: "transform",
        transform: `scale(${scale}) translate3d(${xy[0]}px, ${xy[1]}px, 0)`,
        isolation: "isolate",
      }}
    >
      {children}
    </div>
  );
}

function DisableBackdropFilter({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        backdropFilter: "none!important",
      }}
    >
      {children}
    </div>
  );
}

function CanvasBackground({ backgroundColor }: { backgroundColor?: string }) {
  return (
    <div
      id="canvas-background"
      style={{
        zIndex: -2,
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor,
      }}
    />
  );
}

function auto_initial_transform(
  viewbound: Box,
  nodes: TCanvasNode[]
): CanvasTransform {
  const _default = {
    scale: CANVAS_INITIAL_SCALE,
    xy: CANVAS_INITIAL_XY,
  };

  if (!nodes || viewbound_not_measured(viewbound)) {
    return _default;
  }

  const fit_single_node = (n: TCanvasNode) => {
    return centerOf(viewbound, 0, n);
  };

  if (nodes.length === 0) {
    return _default;
  } else if (nodes.length === 1) {
    // return center the node
    const c = fit_single_node(nodes[0]);
    return {
      xy: c.translate,
      scale: c.scale,
    };
  } else if (nodes.length < 20) {
    // fit bounds
    const c = centerOf(viewbound, 0, ...nodes);
    return {
      xy: c.translate,
      scale: c.scale,
    };
  } else {
    // if more than 20 nodes, just center the first one. why? -> loading all frames at once will slow down the canvas, and in most cases, we don't have to show the whole content of the canvas.
    // fit first item
    const c = fit_single_node(nodes[0]);
    return {
      xy: c.translate,
      scale: c.scale,
    };
  }

  return _default;
}

/**
 * when viewbound is not measured, it means the canvas is not ready to render. and the value will be `[0,0,0,0]` (from react-use-measure)
 * @param viewbound visible canvas area bound
 * @returns
 */
const viewbound_not_measured = (viewbound: Box) => {
  return (
    !viewbound ||
    (viewbound[0] === 0 &&
      viewbound[1] === 0 &&
      viewbound[2] === 0 &&
      viewbound[3] === 0)
  );
};

function Debug({
  infos,
}: {
  infos: { label: string; value?: string | number | boolean | null }[];
}) {
  return (
    <DebugInfoContainer>
      {infos.map(({ label, value }, i) => {
        if (value === undefined || value === null) {
          return <></>;
        }
        return (
          <div key={i}>
            {label}: {JSON.stringify(value)}
          </div>
        );
      })}
    </DebugInfoContainer>
  );
}

const DebugInfoContainer = styled.div`
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  color: white;
  padding: 0.5rem;
  font-size: 0.8rem;
  font-family: monospace;
  line-height: 1.2;
  white-space: pre;
`;
