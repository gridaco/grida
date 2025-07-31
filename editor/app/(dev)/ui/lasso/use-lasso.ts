"use client";

import React from "react";
import { useGesture } from "@use-gesture/react";

export interface Point {
  x: number;
  y: number;
}

export interface UseLassoOptions {
  onComplete?: (points: Point[]) => void;
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
  const [points, setPoints] = React.useState<Point[]>([]);
  const drawingRef = React.useRef(false);
  const startRef = React.useRef<Point | null>(null);

  const getPoint = (event: PointerEvent | MouseEvent): Point => {
    const rect = ref.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left || 0),
      y: event.clientY - (rect?.top || 0),
    };
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
        const dx = Math.round((current.x - start.x) / q) * q;
        const dy = Math.round((current.y - start.y) / q) * q;
        const quantized = { x: start.x + dx, y: start.y + dy };
        setPoints((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.x === quantized.x && last.y === quantized.y) {
            return prev;
          }
          return [...prev, quantized];
        });
      },
      onPointerUp: () => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        onComplete?.(points);
      },
    },
    { target: ref }
  );

  return { ref, points };
}
