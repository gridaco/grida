"use client";

import React from "react";
import { Lasso } from "./lasso";

export default function LassoDemoPage() {
  const [points, setPoints] = React.useState<{ x: number; y: number }[]>([]);

  return (
    <main className="relative w-dvw h-dvh select-none">
      <Lasso onComplete={setPoints} />
      {points.length > 0 && (
        <pre className="absolute top-4 left-4 z-10 bg-background/80 backdrop-blur-sm border rounded p-2 text-xs font-mono">
          {JSON.stringify(points, null, 2)}
        </pre>
      )}
    </main>
  );
}
