import React, { useRef, useEffect, useCallback, useMemo } from "react";

interface TransformProps {
  a: number; // Scale X
  b: number; // Skew Y
  c: number; // Skew X
  d: number; // Scale Y
  e: number; // Translate X
  f: number; // Translate Y
}

// Component props interface defining all possible configuration options
interface PixelGridProps {
  cellSize?: number;
  zoomLevel?: number;
  enabled?: boolean;

  backgroundColor?: string;
  gridColor?: string;
  opacity?: number;

  minZoomLevel?: number;
  transform?: TransformProps;
}

// Utility function to determine if a color is light or dark
// Uses perceived luminance formula from WCAG 2.0
const isLightColor = (color: string): boolean => {
  const hex = color.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate perceived brightness using RGB coefficients
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
};

// Determine grid color based on background for optimal contrast
const determineGridColor = (backgroundColor: string): string => {
  return isLightColor(backgroundColor) ? "#000000" : "#ffffff";
};

const PixelGrid: React.FC<PixelGridProps> = ({
  cellSize = 1,
  zoomLevel = 1,
  enabled = true,
  backgroundColor = "#ffffff",
  gridColor,
  opacity = 0.1,
  minZoomLevel = 4,
  transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
}) => {
  // Refs for DOM elements and animation frame
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  // Memoized grid color calculation
  const computedGridColor = useMemo(() => {
    return gridColor || determineGridColor(backgroundColor);
  }, [gridColor, backgroundColor]);

  // Main rendering function
  const renderGrid = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !enabled || zoomLevel < minZoomLevel) return;

    // Get container dimensions and device pixel ratio
    const width = container.offsetWidth;
    const height = container.offsetHeight;
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size accounting for device pixel ratio
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear previous render
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply device pixel ratio scaling
    ctx.scale(dpr, dpr);

    // Apply editor's transform matrix
    ctx.setTransform(
      transform.a * dpr,
      transform.b,
      transform.c,
      transform.d * dpr,
      transform.e * dpr,
      transform.f * dpr
    );

    ctx.strokeStyle = computedGridColor;
    ctx.globalAlpha = opacity;
    ctx.lineWidth = 1 / zoomLevel;

    const effectiveCellSize = cellSize * zoomLevel;

    const startX =
      Math.floor(-transform.e / effectiveCellSize) * effectiveCellSize;
    const startY =
      Math.floor(-transform.f / effectiveCellSize) * effectiveCellSize;
    const endX = width + Math.abs(transform.e);
    const endY = height + Math.abs(transform.f);

    for (let x = startX; x <= endX; x += effectiveCellSize) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }

    for (let y = startY; y <= endY; y += effectiveCellSize) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
  }, [
    enabled,
    zoomLevel,
    minZoomLevel,
    cellSize,
    computedGridColor,
    opacity,
    transform,
  ]);

  // Handle window resize and component cleanup
  useEffect(() => {
    const handleResize = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(renderGrid);
    };

    // Add resize listener and initial render
    window.addEventListener("resize", handleResize);
    renderGrid();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderGrid]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        pointerEvents: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
};

export default PixelGrid;
