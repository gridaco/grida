"use client";

import * as React from "react";
import type cmath from "@grida/cmath";
import { guide, type SnapResult } from "@grida/cmath/_snap";
import { HUDCanvas } from "./hud";
import { snapGuideToHUDDraw } from "./snap-guide";

export interface SnapGuideProps {
  width: number;
  height: number;
  transform: cmath.Transform;
  snapping: SnapResult | undefined;
  color?: string;
  className?: string;
}

export const SnapGuide: React.FC<SnapGuideProps> = (props) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<HUDCanvas | null>(null);

  React.useEffect(() => {
    if (!canvasRef.current) return;
    if (!rendererRef.current) {
      rendererRef.current = new HUDCanvas(canvasRef.current, {
        color: props.color,
      });
    }

    if (props.color) rendererRef.current.setColor(props.color);
    rendererRef.current.setSize(props.width, props.height);
    rendererRef.current.setTransform(props.transform);

    const guideData = props.snapping ? guide.plot(props.snapping) : undefined;
    const draw = snapGuideToHUDDraw(guideData);
    const rafId = requestAnimationFrame(() => {
      rendererRef.current?.draw(draw);
    });
    return () => cancelAnimationFrame(rafId);
  }, [props.width, props.height, props.transform, props.snapping, props.color]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: props.width,
        height: props.height,
        pointerEvents: "none",
      }}
      className={props.className}
    />
  );
};
