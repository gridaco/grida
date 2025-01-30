"use client";

import React, { useRef, useEffect } from "react";
import { Axis, RulerCanvas, RulerOptions } from "./ruler";

export type RulerProps = Partial<
  Pick<
    RulerOptions,
    "marks" | "font" | "textSideOffset" | "overlapThreshold" | "ranges"
  >
> & {
  axis: Axis;
  width: number;
  height: number;
  steps?: number[];
  fadeThreshold?: number;
  transform: { scaleX: number; translateX: number };
};

export const AxisRuler: React.FC<RulerProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rulerRef = useRef<RulerCanvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!rulerRef.current) {
      // Create once
      rulerRef.current = new RulerCanvas(canvasRef.current, {
        axis: props.axis,
        zoom: props.transform.scaleX,
        offset: props.transform.translateX,
      });
    }

    rulerRef.current.update({
      marks: props.marks,
      axis: props.axis,
      steps: props.steps,
      ranges: props.ranges,
      overlapThreshold: props.overlapThreshold,
      zoom: props.transform.scaleX,
      offset: props.transform.translateX,
      textSideOffset: props.textSideOffset,
      font: props.font,
    });

    rulerRef.current.setSize(props.width, props.height);
    rulerRef.current.draw();
  }, [props]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: props.width, height: props.height }}
    />
  );
};
