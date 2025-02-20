"use client";

import React, { useRef, useEffect } from "react";
import {
  TransparencyGridCanvas,
  TransparencyGridOptions,
} from "./transparency-grid";

export interface TransparencyProps extends TransparencyGridOptions {
  width: number;
  height: number;
}

export const TransparencyGrid: React.FC<TransparencyProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<TransparencyGridCanvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!gridRef.current) {
      // Create once
      gridRef.current = new TransparencyGridCanvas(canvasRef.current, {
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
