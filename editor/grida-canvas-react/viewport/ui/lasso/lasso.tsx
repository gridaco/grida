"use client";

import React from "react";
import { cn } from "@/components/lib/utils";
import type cmath from "@grida/cmath";

export interface LassoProps extends Omit<
  React.SVGProps<SVGSVGElement>,
  "points"
> {
  points: cmath.Vector2[];
}

export const Lasso = React.forwardRef<SVGSVGElement, LassoProps>(function Lasso(
  { points, className, ...props },
  ref
) {
  return (
    <svg
      ref={ref}
      className={cn("size-full touch-none cursor-crosshair", className)}
      {...props}
    >
      {points.length > 1 && (
        <polyline
          points={points.map((p) => `${p[0]},${p[1]}`).join(" ")}
          style={{
            fill: "var(--color-workbench-accent-sky)",
            fillOpacity: 0.2,
            fillRule: "evenodd",
            stroke: "var(--color-workbench-accent-sky)",
            strokeDasharray: "4 4",
          }}
        />
      )}
    </svg>
  );
});
