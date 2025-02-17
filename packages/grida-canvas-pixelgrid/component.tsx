"use client";

import React, { useRef, useEffect } from "react";
import { PixelGridCanvas, PixelGridOptions } from "./pixel-grid";

export interface PixelGridProps extends PixelGridOptions {
  width: number;
  height: number;
}

export const PixelGrid: React.FC<PixelGridProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<PixelGridCanvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!gridRef.current) {
      // Create once
      gridRef.current = new PixelGridCanvas(canvasRef.current, {
        unit: props.unit,
        steps: props.steps,
        transform: props.transform,
        color: props.color,
      });
    }

    gridRef.current.setSize(props.width, props.height);
    gridRef.current.updateTransform(props.transform);
    gridRef.current.draw();
  }, [props]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: props.width, height: props.height }}
    />
  );
};
