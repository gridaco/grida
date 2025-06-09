"use client";
import * as React from "react";
import { BenchmarkWebGLRectangles } from "@grida/skia/benchmarks/rectangles";

export default function WebGLBenchmark() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<BenchmarkWebGLRectangles | null>(null);

  React.useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new BenchmarkWebGLRectangles(canvasRef.current);
    }
    return () => rendererRef.current?.dispose();
  }, []);

  return (
    <main className="w-dvw h-dvh flex items-center justify-center bg-white">
      <canvas ref={canvasRef} width={800} height={600} />
    </main>
  );
}
