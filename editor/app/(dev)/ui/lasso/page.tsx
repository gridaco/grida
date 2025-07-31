"use client";

import React from "react";
import { Lasso } from "./lasso";
import { useLasso } from "./use-lasso";

export default function LassoDemoPage() {
  const [completed, setCompleted] = React.useState<{ x: number; y: number }[]>(
    []
  );
  const { ref, points } = useLasso({ onComplete: setCompleted });

  return (
    <main className="fixed inset-0 w-full h-full select-none">
      {/* Full Screen Lasso Canvas */}
      <div className="relative w-full h-full p-6">
        <div className="relative w-full h-full rounded-xl shadow-2xl overflow-hidden">
          <Lasso ref={ref} points={points} />
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
      </div>

      {completed.length > 0 && (
        <div className="absolute top-4 right-4 z-10 bg-background/80 backdrop-blur-sm border rounded-lg shadow-lg p-3 max-h-64 max-w-96 min-w-52">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            points
          </div>
          <pre className="text-xs font-mono overflow-y-auto max-h-48">
            {JSON.stringify(completed, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
