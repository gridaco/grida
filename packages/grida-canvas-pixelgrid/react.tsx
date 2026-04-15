"use client";

import * as React from "react";
import { useRef, useEffect } from "react";
import { PixelGridCanvas, PixelGridOptions } from "./pixel-grid";

export interface PixelGridProps extends PixelGridOptions {
  width: number;
  height: number;
}

export const PixelGrid: React.FC<PixelGridProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<PixelGridCanvas | null>(null);

  const { width, height, color, unit, steps, transform } = props;
  const step0 = steps?.[0];
  const step1 = steps?.[1];
  const t00 = transform[0][0];
  const t01 = transform[0][1];
  const t02 = transform[0][2];
  const t10 = transform[1][0];
  const t11 = transform[1][1];
  const t12 = transform[1][2];

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!gridRef.current) {
      // Create once
      gridRef.current = new PixelGridCanvas(canvasRef.current, {
        unit,
        steps,
        transform,
        color,
      });
    }

    gridRef.current.setSize(width, height);
    gridRef.current.updateTransform(transform);
    gridRef.current.draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally using extracted scalar values for value-level comparison; parent refs (transform, steps) are excluded to avoid re-running on new array references
  }, [width, height, color, step0, step1, t00, t01, t02, t10, t11, t12]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: props.width, height: props.height }}
    />
  );
};
