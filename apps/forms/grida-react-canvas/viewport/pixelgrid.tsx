import React, { useRef, useEffect } from "react";

interface PixelGridProps {
  cellSize?: number;
  zoomLevel?: number;
  isEnabled?: boolean;
  transform?: { translateX: number; translateY: number; scale: number };
  backgroundIsDark?: boolean;
}

const PixelGrid: React.FC<PixelGridProps> = ({
  cellSize = 10,
  zoomLevel = 1,
  isEnabled = true,
  transform = { translateX: 0, translateY: 0, scale: 1 },
  backgroundIsDark = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !isEnabled || zoomLevel < 4) return; // Grid is rendered only if enabled and zoomLevel >= 4

    // Match canvas size to container size
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    // Handle device pixel ratio for crisp lines
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const step = cellSize * zoomLevel * transform.scale;

    ctx.clearRect(0, 0, width, height);

    // Set stroke style for grid lines with dynamic contrast
    ctx.strokeStyle = backgroundIsDark ? "rgba(255, 255, 255, 0.1)" : "#ccc";
    ctx.lineWidth = 1;

    // Translate the grid based on the transformation
    ctx.save();
    ctx.translate(transform.translateX % step, transform.translateY % step);

    for (let x = 0; x <= width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y <= height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.restore();
  }, [cellSize, zoomLevel, isEnabled, transform, backgroundIsDark]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: backgroundIsDark ? "#333" : "#fff", // Optional: Set a default background for better contrast
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
};

export default PixelGrid;
