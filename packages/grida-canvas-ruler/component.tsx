"use client";

import React, { useRef, useEffect } from "react";
import { Axis, RulerCanvas, RulerOptions } from "./ruler";

export type RulerProps = Partial<
  Pick<RulerOptions, "font" | "labelOffset" | "fadeThreshold">
> & {
  axis: Axis;
  width: number;
  height: number;
  steps?: number[];
  fadeThreshold?: number;
  transform: { scaleX: number; translateX: number };
  labelOffset?: number;
};

export const Ruler: React.FC<RulerProps> = ({
  axis,
  width,
  height,
  steps,
  fadeThreshold,
  transform,
  labelOffset,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const rc = new RulerCanvas(canvasRef.current, {
      axis: axis,
      steps,
      fadeThreshold,
      scale: transform.scaleX,
      translate: transform.translateX,
      labelOffset,
    });
    rc.setSize(width, height);
    rc.draw();
  }, [axis, width, height, steps, fadeThreshold, transform, labelOffset]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
};
