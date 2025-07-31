"use client";

import React from "react";
import { useGesture } from "@use-gesture/react";
import { cn } from "@/components/lib/utils";

export interface Point {
  x: number;
  y: number;
}

export interface LassoProps {
  onComplete?: (points: Point[]) => void;
  className?: string;
}

export function Lasso({ onComplete, className }: LassoProps) {
  const ref = React.useRef<SVGSVGElement>(null);
  const [points, setPoints] = React.useState<Point[]>([]);
  const [drawing, setDrawing] = React.useState(false);

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
        setDrawing(true);
      },
      onPointerMove: ({ event }) => {
        if (!drawing) return;
        setPoints((prev) => [...prev, getPoint(event as PointerEvent)]);
      },
      onPointerUp: () => {
        if (!drawing) return;
        setDrawing(false);
        onComplete?.(points);
      },
    },
    { target: ref }
  );

  return (
    <svg
      ref={ref}
      className={cn("size-full touch-none cursor-crosshair", className)}
    >
      {points.length > 1 && (
        <polygon
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          style={{
            fill: "var(--color-workbench-accent-sky)",
            fillOpacity: 0.2,
            stroke: "var(--color-workbench-accent-sky)",
            strokeDasharray: "4 4",
          }}
        />
      )}
    </svg>
  );
}
