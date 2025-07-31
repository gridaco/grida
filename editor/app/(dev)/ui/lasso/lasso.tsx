"use client";

import React from "react";
import { cn } from "@/components/lib/utils";
import type { Point } from "./use-lasso";

export interface LassoProps
  extends Omit<React.SVGProps<SVGSVGElement>, "points"> {
  points: Point[];
}

export const Lasso = React.forwardRef<SVGSVGElement, LassoProps>(
  ({ points, className, ...props }, ref) => {
    return (
      <svg
        ref={ref}
        className={cn("size-full touch-none cursor-crosshair", className)}
        {...props}
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
);
