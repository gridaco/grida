import { ReflectSceneNode } from "@design-sdk/figma-node";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CanvasEventTarget,
  OnPanningHandler,
  OnZoomingHandler,
  OnPointerMoveHandler,
} from "../canvas-event-target";
import { transform_by_zoom_delta, get_hovering_target } from "../math";
import { HoverOutlineHightlight } from "../overlay";
import { FrameTitle } from "../frame-title";

type XY = [number, number];
type XYWH = [number, number, number, number];
type CanvasTransform = {
  scale: number;
  xy: XY;
};

export function Canvas({
  nodes,
  renderItem,
}: {
  nodes: ReflectSceneNode[];
  renderItem: (node: ReflectSceneNode) => React.ReactNode;
}) {
  const [zoom, setZoom] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const [xy, setXY] = useState<[number, number]>([0, 0]);
  const [isPanning, setIsPanning] = useState(false);

  const [hovering, sethovering] = useState<ReflectSceneNode | null>(null);

  const onPointerMove: OnPointerMoveHandler = (state) => {
    const hovering = get_hovering_target({
      point: state.xy,
      tree: nodes,
      zoom: zoom,
      offset: xy,
    });
    sethovering(hovering);
  };

  const onPanning: OnPanningHandler = ({ delta: [x, y], wheeling }) => {
    setXY([xy[0] - x / zoom, xy[1] - y / zoom]);
  };
  const onZooming: OnZoomingHandler = (state) => {
    const zoomdelta = state.delta[0];
    const zoompoint: XY = [
      // @ts-ignore
      state.event.clientX ?? 0,
      // @ts-ignore
      state.event.clientY ?? 0,
    ];

    const newzoom = Math.max(zoom + zoomdelta, 0.1);
    setZoom(newzoom);

    const delta = transform_by_zoom_delta(zoomdelta, zoompoint);
    setXY([xy[0] + delta[0], xy[1] + delta[1]]);
  };

  const is_canvas_transforming = isPanning || isZooming;

  return (
    <>
      <CanvasEventTarget
        onPanning={onPanning}
        onPanningStart={() => {
          setIsPanning(true);
        }}
        onPanningEnd={() => {
          setIsPanning(false);
        }}
        onZooming={onZooming}
        onZoomingStart={() => {
          setIsZooming(true);
        }}
        onZoomingEnd={() => {
          setIsZooming(false);
        }}
        onPointerMove={onPointerMove}
        onPointerMoveStart={() => {}}
        onPointerMoveEnd={() => {}}
      />
      <CanvasTransformRoot scale={zoom} xy={xy}>
        <DisableBackdropFilter>{nodes?.map(renderItem)}</DisableBackdropFilter>
      </CanvasTransformRoot>
      <HudSurface
        xy={xy}
        zoom={zoom}
        hide={is_canvas_transforming}
        labelDisplayNodes={nodes}
        highlights={
          hovering
            ? [
                {
                  id: hovering.id,
                  xywh: [
                    hovering.absoluteX,
                    hovering.absoluteY,
                    hovering.width,
                    hovering.height,
                  ],
                },
              ]
            : []
        }
      />
    </>
  );
}

function HudSurface({
  xy,
  highlights,
  zoom,
  hide,
  labelDisplayNodes,
}: {
  xy: XY;
  highlights: { id: string; xywh: XYWH }[];
  labelDisplayNodes: ReflectSceneNode[];
  zoom: number;
  hide: boolean;
}) {
  const [x, y] = xy;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        willChange: "transform",
        transform: `translateX(${x}px) translateY(${y}px)`,
        opacity: hide ? 0 : 1,
        isolation: "isolate",
        transition: "opacity 0.15s ease 0s",
      }}
      id="hud-surface"
    >
      {labelDisplayNodes &&
        labelDisplayNodes.map((node) => (
          <FrameTitle
            name={node.name}
            xywh={[node.absoluteX, node.absoluteY, node.width, node.height]}
            zoom={zoom}
          />
        ))}
      {highlights &&
        highlights.map((h) => {
          return (
            <HoverOutlineHightlight
              key={h.id}
              type="xywhr"
              xywh={h.xywh}
              zoom={zoom}
            />
          );
        })}
    </div>
  );
}

function CanvasTransformRoot({
  children,
  scale,
  xy,
}: { children: React.ReactNode } & CanvasTransform) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        willChange: "transform",
        transform: `scale(${scale}) translateX(${xy[0]}px) translateY(${xy[1]}px)`,
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
