import React, { useEffect, useRef, useState, useMemo } from "react";
import { ReflectSceneNode } from "@design-sdk/figma-node";
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
} from "../math";
import { utils } from "@design-sdk/core";
import { LazyFrame } from "@code-editor/canvas/lazy-frame";
import { HudCustomRenderers, HudSurface } from "../hud";
import type { Box, XY, CanvasTransform, XYWH } from "../types";
import type { FrameOptimizationFactors } from "../frame";
const designq = utils.query;

const INITIAL_SCALE = 0.5;
const INITIAL_XY: XY = [0, 0];
const LAYER_HOVER_HIT_MARGIN = 3.5;
const MIN_ZOOM = 0.02;

interface CanvasState {
  pageid: string;
  filekey: string;
  backgroundColor?: React.CSSProperties["backgroundColor"];
  nodes: ReflectSceneNode[];
  highlightedLayer?: string;
  selectedNodes: string[];
  readonly?: boolean;
  /**
   * when provided, it will override the saved value or centering logic and use this transform as initial instead.
   *
   * Canvas automatically saves the last transform and also automatically calculates the initial transform based on the input's complexity.
   *
   * @default undefined
   */
  initialTransform?: CanvasTransform;
}

type CanvasCustomRenderers = HudCustomRenderers & {
  renderItem: (
    p: {
      node: ReflectSceneNode & { filekey: string };
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

const default_canvas_preferences: CanvsPreferences = {
  can_highlight_selected_layer: false,
  marquee: {
    disabled: false,
  },
  grouping: {
    disabled: false,
  },
};

interface HovringNode {
  node: ReflectSceneNode;
  reason: "frame-title" | "raycast" | "external";
}

export function Canvas({
  viewbound,
  renderItem,
  onSelectNode,
  onClearSelection,
  filekey,
  pageid,
  nodes,
  initialTransform,
  highlightedLayer,
  selectedNodes,
  readonly = true,
  config = default_canvas_preferences,
  backgroundColor,
  ...props
}: {
  viewbound: Box;
  onSelectNode?: (...node: ReflectSceneNode[]) => void;
  onClearSelection?: () => void;
} & CanvasCustomRenderers &
  CanvasState & {
    config?: CanvsPreferences;
  }) {
  const _canvas_state_store = useMemo(
    () => new CanvasStateStore(filekey, pageid),
    [filekey, pageid]
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

    if (viewbound_not_measured(viewbound)) {
      return;
    }

    const t = auto_initial_transform(viewbound, nodes);
    setZoom(t.scale);
    setOffset(t.xy);
    setTransformInitialized(true);
  }, [viewbound]);

  const [transformIntitialized, setTransformInitialized] = useState(false);
  const [zoom, setZoom] = useState(initialTransform?.scale);
  const [isZooming, setIsZooming] = useState(false);
  const [offset, setOffset] = useState<[number, number]>(initialTransform?.xy);
  const nonscaled_offset: XY = offset
    ? [offset[0] / zoom, offset[1] / zoom]
    : [0, 0];
  const [isPanning, setIsPanning] = useState(false);
  const [isDraggomg, setIsDragging] = useState(false);
  const [marquee, setMarquee] = useState<XYWH>(null);

  const cvtransform: CanvasTransform = {
    scale: zoom,
    xy: offset,
  };

  const node = (id) => designq.find_node_by_id_under_inpage_nodes(id, nodes);

  const wshighlight = highlightedLayer
    ? ({ node: node(highlightedLayer), reason: "external" } as HovringNode)
    : null;

  const [hoveringLayer, setHoveringLayer] =
    useState<HovringNode | null>(wshighlight);

  useEffect(() => {
    setHoveringLayer(wshighlight);
  }, [highlightedLayer]);

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
        onSelectNode(...selections);
      }
    }
    //
  }, [marquee]);

  const onPointerMove: OnPointerMoveHandler = (state) => {
    if (isPanning || isZooming || isDraggomg) {
      // don't perform hover calculation while transforming.
      return;
    }
    const hovering = target_of_point({
      point: state.xy,
      tree: nodes,
      zoom: zoom,
      offset: nonscaled_offset,
      margin: LAYER_HOVER_HIT_MARGIN,
      reverse: true,
      ignore: (n) => selectedNodes.includes(n.id),
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
    if (isPanning || isZooming) {
      return;
    }
    if (hoveringLayer) {
      switch (hoveringLayer.reason) {
        case "frame-title":
        case "raycast":
          onSelectNode(hoveringLayer.node);
          break;
      }
    } else {
      onClearSelection();
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

    const newzoom = Math.max(zoom + zoomdelta, MIN_ZOOM);

    // calculate the offset that should be applied with scale with css transform.
    const [newx, newy] = [
      ox - (ox - offset[0]) * (newzoom / zoom),
      oy - (oy - offset[1]) * (newzoom / zoom),
    ];

    setZoom(newzoom);
    setOffset([newx, newy]);
  };

  const onDragStart: OnDragHandler = (s) => {
    onClearSelection();
    setIsDragging(true);
    setHoveringLayer(null);

    // set the marquee start point
    const [x, y] = s.initial;
    const [ox, oy] = offset;
    const [x1, y1] = [x - ox, y - oy];
    setMarquee([x1, y1, 0, 0]);
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

    if (marquee) {
      const [w, h] = [
        x1 - marquee[0], // w
        y1 - marquee[1], // h
      ];
      setMarquee([marquee[0], marquee[1], w, h]);
    }

    // edge scrolling
    const [cx, cy] = [x, y];
    const [dx, dy] = edge_scrolling(cx, cy, viewbound);
    if (dx || dy) {
      setOffset([ox + dx, oy + dy]);
    }
  };

  const onDragEnd: OnDragHandler = (s) => {
    setMarquee(null);
    setIsDragging(false);
  };

  const is_canvas_transforming = isPanning || isZooming;
  const selected_nodes = selectedNodes
    ?.map((id) => designq.find_node_by_id_under_inpage_nodes(id, nodes))
    .filter(Boolean);

  const items = useMemo(() => {
    return nodes?.map((node) => {
      node["filekey"] = filekey;
      return (
        <LazyFrame key={node.id} xy={[node.x, node.y]} size={node}>
          {/* 👇 dev only (for performance tracking) 👇 */}
          {/* <div style={{ width: "100%", height: "100%", background: "grey" }} /> */}
          {/* 👆 ----------------------------------- 👆 */}
          {renderItem({
            node: node as ReflectSceneNode & { filekey: string },
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
      <CanvasEventTarget
        onPanning={onPanning}
        onPanningStart={() => {
          setIsPanning(true);
        }}
        onPanningEnd={() => {
          setIsPanning(false);
          _canvas_state_store.saveLastTransform(cvtransform);
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
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
      >
        <HudSurface
          offset={nonscaled_offset}
          zoom={zoom}
          hide={is_canvas_transforming}
          readonly={readonly}
          disableMarquee={config.marquee.disabled}
          disableGrouping={config.grouping.disabled}
          marquee={marquee}
          labelDisplayNodes={nodes}
          selectedNodes={selected_nodes}
          highlights={
            hoveringLayer?.node
              ? (config.can_highlight_selected_layer
                  ? [hoveringLayer.node]
                  : noduplicates([hoveringLayer.node], selected_nodes)
                ).map((h) => ({
                  id: h.id,
                  xywh: [h.absoluteX, h.absoluteY, h.width, h.height],
                  rotation: h.rotation,
                }))
              : []
          }
          onHoverNode={(id) => {
            setHoveringLayer({ node: node(id), reason: "frame-title" });
          }}
          onSelectNode={(id) => {
            onSelectNode(node(id));
          }}
          renderFrameTitle={props.renderFrameTitle}
        />
      </CanvasEventTarget>
      <CanvasBackground backgroundColor={backgroundColor} />
      <CanvasTransformRoot scale={zoom} xy={nonscaled_offset}>
        <DisableBackdropFilter>{items}</DisableBackdropFilter>
      </CanvasTransformRoot>
    </>
  );
}

function noduplicates(
  a: ReflectSceneNode[],
  b: ReflectSceneNode[]
): ReflectSceneNode[] {
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
      style={{
        zIndex: -2,
        position: "fixed",
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
  nodes: ReflectSceneNode[]
): CanvasTransform {
  const _default = {
    scale: INITIAL_SCALE,
    xy: INITIAL_XY,
  };

  if (!nodes || viewbound_not_measured(viewbound)) {
    return _default;
  }

  const fit_single_node = (n: ReflectSceneNode) => {
    return centerOf(viewbound, n);
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
    const c = centerOf(viewbound, ...nodes);
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
