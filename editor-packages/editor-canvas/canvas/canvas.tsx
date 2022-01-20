import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CanvasEventTarget,
  OnPanningHandler,
  OnZoomingHandler,
} from "../canvas-event-target";
import { transform_by_zoom_delta } from "../math";
type XY = [number, number];
type CanvasTransform = {
  scale: number;
  xy: XY;
};

export function Canvas({ children }: { children?: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  const [xy, setXY] = useState<[number, number]>([0, 0]);

  const onPanning: OnPanningHandler = ({ delta: [x, y], wheeling }) => {
    setXY([xy[0] - x / scale, xy[1] - y / scale]);
  };
  const onZooming: OnZoomingHandler = (state) => {
    const zoomdelta = state.delta[0];
    const zoompoint: XY = [
      state.event["clientX"] ?? 0,
      state.event["clientY"] ?? 0,
    ];

    const newzoom = Math.max(scale + zoomdelta, 0.1);
    setScale(newzoom);

    const delta = transform_by_zoom_delta(zoomdelta, zoompoint);
    setXY([xy[0] + delta[0], xy[1] + delta[1]]);
  };

  return (
    <>
      <CanvasEventTarget onPanning={onPanning} onZooming={onZooming} />
      <CanvasTransformRoot scale={scale} xy={xy}>
        <DisableBackdropFilter>{children}</DisableBackdropFilter>
      </CanvasTransformRoot>
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
