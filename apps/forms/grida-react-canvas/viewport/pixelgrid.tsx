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
    if (!canvas || !container || !isEnabled || zoomLevel < 4) return;

    // Set up canvas size with a buffer zone for smooth panning
    const width = container.offsetWidth * 1.5;
    const height = container.offsetHeight * 1.5;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    // Position canvas with negative margins to center the buffer zone
    const offsetX = (width - container.offsetWidth) / 2;
    const offsetY = (height - container.offsetHeight) / 2;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.marginLeft = `-${offsetX}px`;
    canvas.style.marginTop = `-${offsetY}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Scale context for device pixel ratio
    ctx.scale(dpr, dpr);

    // Calculate grid step size
    const step = cellSize * transform.scale;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Set grid style
    ctx.strokeStyle = backgroundIsDark
      ? "rgba(255, 255, 255, 0.1)"
      : "rgb(204, 204, 204)";
    ctx.lineWidth = backgroundIsDark ? 0.75 : 0.5;

    // Calculate grid boundaries with buffer
    const startX = Math.floor((-transform.translateX - width) / step) * step;
    const endX = Math.ceil((-transform.translateX + width * 2) / step) * step;
    const startY = Math.floor((-transform.translateY - height) / step) * step;
    const endY = Math.ceil((-transform.translateY + height * 2) / step) * step;

    // Apply transform
    ctx.save();
    ctx.translate(
      transform.translateX + offsetX,
      transform.translateY + offsetY
    );

    // Draw vertical lines
    for (let x = startX; x <= endX; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }

    // Draw horizontal lines
    for (let y = startY; y <= endY; y += step) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
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
        position: "absolute",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

export default PixelGrid;
