"use client";

import React from "react";
import { useGesture } from "@use-gesture/react";

export interface Point {
  x: number;
  y: number;
}

export interface UseLassoOptions {
  onComplete?: (points: Point[]) => void;
}

export function useLasso(options?: UseLassoOptions) {
  const { onComplete } = options || {};
  const ref = React.useRef<SVGSVGElement>(null);
  const [points, setPoints] = React.useState<Point[]>([]);
  const drawingRef = React.useRef(false);

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
        setPoints([getPoint(event as PointerEvent)]);
        drawingRef.current = true;
      },
      onPointerMove: ({ event }) => {
        if (!drawingRef.current) return;
        setPoints((prev) => {
          const next = [...prev, getPoint(event as PointerEvent)];
          return next;
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
