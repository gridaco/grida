"use client";

import React from "react";
import { Lasso } from "./lasso";
import { useLasso, type Point } from "./use-lasso";
import { useThrottle } from "@uidotdev/usehooks";
import cmath from "@grida/cmath";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/utils";
import { TransparencyGrid } from "@grida/transparency-grid/react";

export default function LassoDemoPage() {
  const [completed, setCompleted] = React.useState<Point[]>([]);
  const [targets, setTargets] = React.useState<Point[]>([]);
  const [selected, setSelected] = React.useState<Point[]>([]);
  const { ref, points } = useLasso({
    onComplete: (pts) => {
      setCompleted(pts);
    },
  });
  const throttledPoints = useThrottle(points, 50);

  React.useEffect(() => {
    if (throttledPoints.length > 2) {
      const poly = throttledPoints.map((p) => [p.x, p.y]) as cmath.Vector2[];
      setSelected(
        targets.filter((t) => cmath.polygon.pointInPolygon([t.x, t.y], poly))
      );
    } else {
      setSelected([]);
    }
  }, [throttledPoints, targets]);

  const plotPoints = React.useCallback(() => {
    const pts = Array.from({ length: 30 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
    }));
    setTargets(pts);
    setSelected([]);
    setCompleted([]);
  }, []);

  return (
    <main className="fixed inset-0 w-full h-full select-none">
      {/* Full Screen Lasso Canvas */}
      <div className="relative w-full h-full p-6">
        <div className="relative w-full h-full rounded-xl shadow-2xl overflow-hidden">
          <TransparencyGrid
            className="absolute inset-0 pointer-events-none -z-10"
            width={typeof window !== "undefined" ? window.innerWidth : 0}
            height={typeof window !== "undefined" ? window.innerHeight : 0}
            transform={cmath.transform.identity}
          />

          <svg className="absolute inset-0 pointer-events-none w-full h-full">
            {targets.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={4}
                className={cn(
                  "fill-muted-foreground/50",
                  selected.includes(p) && "fill-blue-500"
                )}
              />
            ))}
          </svg>
          <Lasso ref={ref} points={points} className="absolute inset-0" />
        </div>
      </div>

      {/* Floating Title */}
      <div className="absolute top-12 left-12 z-50">
        <div className="bg-background/80 backdrop-blur-sm rounded-lg px-4 py-3 border shadow-lg">
          <h1 className="text-lg font-bold mb-0.5 font-mono">
            @grida/react-lasso
          </h1>
          <p className="text-xs text-muted-foreground">Lasso selection demo</p>
        </div>
        <div className="mt-2">
          <Button size="sm" variant="default" onClick={plotPoints}>
            Plot Points
          </Button>
        </div>
      </div>
    </main>
  );
}
