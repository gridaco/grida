"use client";

import React from "react";
import { useGesture } from "@use-gesture/react";
import type cmath from "@grida/cmath";

export interface UseLassoOptions {
  onComplete?: (points: cmath.Vector2[]) => void;
  /**
   * Quantization step in pixels. Higher number means
   * less points are generated during drawing.
   * @default 4
   */
  q?: number;
}

export function useLasso(options?: UseLassoOptions) {
  const { onComplete, q = 4 } = options || {};
  const ref = React.useRef<SVGSVGElement>(null);
  const [points, setPoints] = React.useState<cmath.Vector2[]>([]);
  const drawingRef = React.useRef(false);
  const startRef = React.useRef<cmath.Vector2 | null>(null);

  const getPoint = (event: PointerEvent | MouseEvent): cmath.Vector2 => {
    const rect = ref.current?.getBoundingClientRect();
    return [
      event.clientX - (rect?.left || 0),
      event.clientY - (rect?.top || 0),
    ];
  };

  useGesture(
    {
      onPointerDown: ({ event }) => {
        const p = getPoint(event as PointerEvent);
        setPoints([p]);
        startRef.current = p;
        drawingRef.current = true;
      },
      onPointerMove: ({ event }) => {
        if (!drawingRef.current || !startRef.current) return;
        const current = getPoint(event as PointerEvent);
        const start = startRef.current;
        const dx = Math.round((current[0] - start[0]) / q) * q;
        const dy = Math.round((current[1] - start[1]) / q) * q;
        const quantized: cmath.Vector2 = [start[0] + dx, start[1] + dy];
        setPoints((prev) => {
          const last = prev[prev.length - 1];
          if (last && last[0] === quantized[0] && last[1] === quantized[1]) {
            return prev;
          }
          return [...prev, quantized];
        });
      },
      onPointerUp: () => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        onComplete?.(points);
        setPoints([]);
        startRef.current = null;
      },
    },
    { target: ref }
  );

  return { ref, points };
}
