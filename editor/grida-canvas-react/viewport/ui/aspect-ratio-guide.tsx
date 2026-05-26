import React from "react";
import cmath from "@grida/cmath";

interface AspectRatioGuideProps {
  rect: cmath.Rectangle;
  direction: cmath.CardinalDirection;
  zIndex?: number;
}

/**
 * AspectRatioGuide component that renders a dashed diagonal line
 * to provide visual feedback during resize operations when aspect ratio is locked.
 *
 * The rect coordinates should be in the same coordinate space as the container.
 * For LayerOverlay (centered coordinate space), pass a rect with coordinates
 * relative to the center (e.g., x: -width/2, y: -height/2, width, height).
 *
 * The 8-case direction→diagonal mapping lives in
 * {@link cmath.ui.diagonalForDirection} — pinned by
 * `packages/grida-cmath/__tests__/cmath.ui.diagonal.test.ts`. This component
 * is the legacy DOM render shell; any hud-side host computes the same line
 * via the same helper.
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

  const { x1, y1, x2, y2 } = cmath.ui.diagonalForDirection(rect, direction);

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
