"use client";
import * as React from "react";
import { CanvasKitRenderer } from "@grida/skia";

export default function SkiaCanvasKitExperimentalPage() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<CanvasKitRenderer | null>(null);

  React.useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new CanvasKitRenderer(canvasRef.current);
    }
  }, []);

  return (
    <main className="w-dvw h-dvh flex flex-col items-center gap-10 justify-center">
      <header className="w-full flex items-center justify-center">
        <h1 className="text-2xl font-bold">
          Grida Canvas <span className="text-sm font-mono">SKIA BACKEND</span>
        </h1>
      </header>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="border border-gray-300 bg-white shadow-lg"
      />
    </main>
  );
}
