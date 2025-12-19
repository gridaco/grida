import React from "react";
import cmath from "@grida/cmath";

interface AspectRatioGuideProps {
  rect: cmath.Rectangle;
  direction: cmath.CardinalDirection;
  zIndex?: number;
}

/**
 * Helper function to map resize direction to diagonal endpoints.
 *
 * For corner directions (ne, se, nw, sw): Line spans from opposite corner to dragged corner
 * For edge directions (n, s, e, w): Line spans the main diagonal in that axis direction
 */
function getDiagonalEndpoints(
  rect: cmath.Rectangle,
  direction: cmath.CardinalDirection
): { x1: number; y1: number; x2: number; y2: number } {
  const { x, y, width, height } = rect;

  // Corner points
  const TL: [number, number] = [x, y];
  const TR: [number, number] = [x + width, y];
  const BL: [number, number] = [x, y + height];
  const BR: [number, number] = [x + width, y + height];

  switch (direction) {
    case "ne":
      // Northeast handle: line from BL to TR
      return { x1: BL[0], y1: BL[1], x2: TR[0], y2: TR[1] };
    case "se":
      // Southeast handle: line from TL to BR (most common)
      return { x1: TL[0], y1: TL[1], x2: BR[0], y2: BR[1] };
    case "nw":
      // Northwest handle: line from BR to TL
      return { x1: BR[0], y1: BR[1], x2: TL[0], y2: TL[1] };
    case "sw":
      // Southwest handle: line from TR to BL
      return { x1: TR[0], y1: TR[1], x2: BL[0], y2: BL[1] };
    case "n":
      // North edge: line from BL to TR
      return { x1: BL[0], y1: BL[1], x2: TR[0], y2: TR[1] };
    case "s":
      // South edge: line from TL to BR
      return { x1: TL[0], y1: TL[1], x2: BR[0], y2: BR[1] };
    case "e":
      // East edge: line from TL to BR
      return { x1: TL[0], y1: TL[1], x2: BR[0], y2: BR[1] };
    case "w":
      // West edge: line from TR to BL
      return { x1: TR[0], y1: TR[1], x2: BL[0], y2: BL[1] };
    default:
      // Default to TL to BR (most common case)
      return { x1: TL[0], y1: TL[1], x2: BR[0], y2: BR[1] };
  }
}

/**
 * AspectRatioGuide component that renders a dashed diagonal line
 * to provide visual feedback during resize operations when aspect ratio is locked.
 *
 * The rect coordinates should be in the same coordinate space as the container.
 * For LayerOverlay (centered coordinate space), pass a rect with coordinates
 * relative to the center (e.g., x: -width/2, y: -height/2, width, height).
 */
export function AspectRatioGuide({
  rect,
  direction,
  zIndex = 20,
}: AspectRatioGuideProps) {
  // Validate rect dimensions
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const { x1, y1, x2, y2 } = getDiagonalEndpoints(rect, direction);

  return (
    <svg
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        cursor: "none",
        willChange: "transform",
        zIndex,
        top: 0,
        left: 0,
      }}
      className="stroke-workbench-accent-sky text-workbench-accent-sky"
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
    </svg>
  );
}
