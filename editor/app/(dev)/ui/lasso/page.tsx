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
    <main className="relative w-dvw h-dvh select-none">
      <Lasso ref={ref} points={points} />
      {completed.length > 0 && (
        <pre className="absolute top-4 left-4 z-10 bg-background/80 backdrop-blur-sm border rounded p-2 text-xs font-mono">
          {JSON.stringify(completed, null, 2)}
        </pre>
      )}
    </main>
  );
}
