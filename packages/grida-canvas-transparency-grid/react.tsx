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

  const { backend, width, height, transform } = props;
  const t00 = transform[0][0];
  const t01 = transform[0][1];
  const t02 = transform[0][2];
  const t10 = transform[1][0];
  const t11 = transform[1][1];
  const t12 = transform[1][2];

  React.useEffect(() => {
    if (!canvasRef.current) return;
    if (!gridRef.current || (backend && gridRef.current.backend !== backend)) {
      // Create once (or re-create if backend changes)
      gridRef.current = new TransparencyGridCanvas(
        canvasRef.current,
        {
          transform,
          color: props.color,
        },
        backend
      );
    }

    gridRef.current.setSize(width, height);
    gridRef.current.updateTransform(transform);
    requestAnimationFrame(() => {
      gridRef.current!.draw();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally using extracted scalar values for value-level comparison; transform ref excluded to avoid re-running on new array references; color only used in constructor
  }, [backend, width, height, t00, t01, t02, t10, t11, t12]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: props.width, height: props.height }}
      className={props.className}
    />
  );
};
