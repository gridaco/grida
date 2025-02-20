import React from "react";

/**
 * @default - TODO: rotation not supported
 * @returns
 */
export function OverlayContainer({
  xywh,
  rotation = 0,
  children,
}: {
  xywh: [number, number, number, number];
  rotation?: number;
  children: React.ReactNode;
}) {
  // const [x, y, w, h] = xywh;
  return (
    <div
      id="overlay-container"
      style={{
        pointerEvents: "none",
        willChange: "transform, opacity",
        // transformOrigin: `${x}px ${y}px`,
        // transform: `rotate(${-rotation}deg)`,
      }}
    >
      {children}
    </div>
  );
}
