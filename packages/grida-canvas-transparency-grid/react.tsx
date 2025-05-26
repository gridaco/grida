"use client";

import * as React from "react";
import { TransparencyGridCanvas } from "./transparency-grid";
import type { TransparencyGridOptions } from "./types";

export interface TransparencyProps extends TransparencyGridOptions {
  backend?: "2d" | "webgpu";
  width: number;
  height: number;
  className?: string;
}

export const TransparencyGrid: React.FC<TransparencyProps> = (props) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const gridRef = React.useRef<TransparencyGridCanvas | null>(null);

  React.useEffect(() => {
    if (!canvasRef.current) return;
    if (
      !gridRef.current ||
      (props.backend && gridRef.current.backend !== props.backend)
    ) {
      // Create once (or re-create if backend changes)
      gridRef.current = new TransparencyGridCanvas(
        canvasRef.current,
        {
          transform: props.transform,
          color: props.color,
        },
        props.backend
      );
    }

    gridRef.current.setSize(props.width, props.height);
    gridRef.current.updateTransform(props.transform);
    requestAnimationFrame(() => {
      gridRef.current!.draw();
    });
  }, [
    props.backend,
    props.width,
    props.height,
    props.transform[0][0],
    props.transform[0][1],
    props.transform[0][2],
    props.transform[1][0],
    props.transform[1][1],
    props.transform[1][2],
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: props.width, height: props.height }}
      className={props.className}
    />
  );
};
