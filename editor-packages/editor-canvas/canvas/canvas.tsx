import { ReflectSceneNode } from "@design-sdk/figma-node";
import styled from "@emotion/styled";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CanvasEventTarget,
  OnPanningHandler,
  OnZoomingHandler,
  OnPointerMoveHandler,
} from "../canvas-event-target";
import { transform_by_zoom_delta, get_hovering_target } from "../math";

import { LazyFrame } from "@code-editor/canvas/lazy-frame";
import { HudSurface } from "./hud-surface";
import type { XY, XYWH } from "../types";

const INITIAL_SCALE = 1;
const INITIAL_XY: XY = [0, 0];
const LAYER_HOVER_HIT_MARGIN = 3.5;

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
  const [zoom, setZoom] = useState(INITIAL_SCALE);
  const [isZooming, setIsZooming] = useState(false);
  const [xy, setXY] = useState<[number, number]>(INITIAL_XY);
  const [isPanning, setIsPanning] = useState(false);

  const [hovering, sethovering] = useState<ReflectSceneNode | null>(null);

  const onPointerMove: OnPointerMoveHandler = (state) => {
    const hovering = get_hovering_target({
      point: state.xy,
      tree: nodes,
      zoom: zoom,
      offset: xy,
      margin: LAYER_HOVER_HIT_MARGIN,
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
        <DisableBackdropFilter>
          {nodes?.map((node) => {
            return (
              <LazyFrame
                xy={[node.x, node.y]}
                size={node}
                zoom={zoom}
                placeholder={<EmptyFrame />}
              >
                {renderItem(node)}
              </LazyFrame>
            );
          })}
        </DisableBackdropFilter>
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

const EmptyFrame = styled.div`
  width: 100%;
  height: 100%;
  background-color: #e09292;
  border-radius: 4px;
  box-shadow: 0px 0px 48px #00000020;
`;
