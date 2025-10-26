"use client";

import React, { useMemo, useState } from "react";
import { useTransformState } from "../../provider";
import cmath from "@grida/cmath";
import { cn } from "@/components/lib/utils";
import { useSurfaceGesture } from "../hooks/use-surface-gesture";
import { SVGPatternDiagonalStripe } from "./svg-fill-patterns";
import { useCurrentEditor, useEditorState } from "../../use-editor";

export function PaddingOverlay({
  containerRect,
  padding,
  offset,
  style,
  onPaddingGestureStart,
}: {
  containerRect: cmath.Rectangle;
  padding: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  offset?: cmath.Vector2;
  style?: React.CSSProperties;
  onPaddingGestureStart?: (side: cmath.RectangleSide) => void;
}) {
  const editor = useCurrentEditor();
  const { transform } = useTransformState();
  const [hoveredSide, setHoveredSide] = useState<
    cmath.RectangleSide | undefined
  >(undefined);

  const padding_with_axis_mirroring_on = useEditorState(
    editor,
    (state) => state.gesture_modifiers.padding_with_axis_mirroring === "on"
  );

  const isHighlighted = (side: cmath.RectangleSide): boolean =>
    side === hoveredSide ||
    !!(
      padding_with_axis_mirroring_on &&
      hoveredSide &&
      cmath.rect.getOppositeSide(hoveredSide) === side
    );

  // Transform container rect to surface space
  const surfaceRect = useMemo(
    () => cmath.rect.transform(containerRect, transform),
    [containerRect, transform]
  );

  const paddingRects = useMemo(() => {
    const rects: Array<{
      rect: cmath.Rectangle;
      side: cmath.RectangleSide;
    }> = [];

    const { top = 0, right = 0, bottom = 0, left = 0 } = padding;

    // Only show padding if it's greater than 0
    if (top > 0) {
      rects.push({
        side: "top",
        rect: {
          x: surfaceRect.x,
          y: surfaceRect.y,
          width: surfaceRect.width,
          height: top * transform[1][1], // Scale by transform
        },
      });
    }

    if (right > 0) {
      rects.push({
        side: "right",
        rect: {
          x: surfaceRect.x + surfaceRect.width - right * transform[0][0],
          y: surfaceRect.y,
          width: right * transform[0][0],
          height: surfaceRect.height,
        },
      });
    }

    if (bottom > 0) {
      rects.push({
        side: "bottom",
        rect: {
          x: surfaceRect.x,
          y: surfaceRect.y + surfaceRect.height - bottom * transform[1][1],
          width: surfaceRect.width,
          height: bottom * transform[1][1],
        },
      });
    }

    if (left > 0) {
      rects.push({
        side: "left",
        rect: {
          x: surfaceRect.x,
          y: surfaceRect.y,
          width: left * transform[0][0],
          height: surfaceRect.height,
        },
      });
    }

    // Apply offset if provided
    if (offset) {
      const invertedOffset = cmath.vector2.invert(offset);
      return rects.map((r) => ({
        ...r,
        rect: cmath.rect.translate(r.rect, invertedOffset),
      }));
    }

    return rects;
  }, [surfaceRect, padding, transform, offset]);

  if (paddingRects.length === 0) return null;

  return (
    <div
      style={style}
      className="pointer-events-none invisible group-hover:visible z-10"
    >
      {/* Define pattern once for all padding edges to avoid SVG pattern ID conflicts */}
      <svg className="sr-only" aria-hidden="true">
        <defs>
          <SVGPatternDiagonalStripe
            id="padding-diagonal-stripes"
            patternWidth={1}
            patternSpacing={5}
            className="text-workbench-accent-sky/50"
          />
        </defs>
      </svg>

      <>
        {/* Render regions (backgrounds + patterns) - lower z-index */}
        {paddingRects.map((item, i) => (
          <PaddingEdgeRegion
            key={`${item.side}-region-${i}`}
            side={item.side}
            rect={item.rect}
            isHovered={isHighlighted(item.side)}
            onPointerEnter={() => setHoveredSide(item.side)}
            onPointerLeave={() => setHoveredSide(undefined)}
          />
        ))}
      </>

      <>
        {/* Render handles - higher z-index to always be accessible */}
        {paddingRects.map((item, i) => (
          <PaddingHandle
            key={`${item.side}-handle-${i}`}
            side={item.side}
            rect={item.rect}
            isHovered={isHighlighted(item.side)}
            onPointerEnter={() => setHoveredSide(item.side)}
            onPointerLeave={() => setHoveredSide(undefined)}
            onPaddingGestureStart={onPaddingGestureStart}
          />
        ))}
      </>
    </div>
  );
}

function PaddingEdgeRegion({
  side,
  rect,
  isHovered,
  ...props
}: React.ComponentProps<"div"> & {
  side: cmath.RectangleSide;
  rect: cmath.Rectangle;
  isHovered: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: rect.y,
        left: rect.x,
        width: rect.width,
        height: rect.height,
      }}
      className="pointer-events-auto bg-transparent"
      {...props}
    >
      {/* SVG Pattern - only visible when hovered */}
      {isHovered && (
        <svg className="absolute inset-0 overflow-visible pointer-events-none">
          <rect
            x="0"
            y="0"
            width={rect.width}
            height={rect.height}
            fill="url(#padding-diagonal-stripes)"
          />
        </svg>
      )}
    </div>
  );
}

function PaddingHandle({
  side,
  rect,
  isHovered,
  onPaddingGestureStart,
  ...props
}: React.ComponentProps<"button"> & {
  side: cmath.RectangleSide;
  rect: cmath.Rectangle;
  isHovered?: boolean;
  onPaddingGestureStart?: (side: cmath.RectangleSide) => void;
}) {
  const bind = useSurfaceGesture({
    onPointerDown: ({ event }) => {
      event.preventDefault();
    },
    onDragStart: ({ event }) => {
      event.preventDefault();
      onPaddingGestureStart?.(side);
    },
  });

  // Calculate absolute center position of the padding rect
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  return (
    <button
      {...bind()}
      {...props}
      className="absolute p-1 pointer-events-auto"
      style={{
        top: centerY,
        left: centerX,
        transform: "translate(-50%, -50%)",
        touchAction: "none",
        cursor: side === "top" || side === "bottom" ? "ns-resize" : "ew-resize",
      }}
    >
      <div
        className={cn(
          "border border-blue-500 hover:bg-blue-500 ring-1 ring-white pointer-events-auto transition-colors",
          side === "top" || side === "bottom" ? "w-4 h-0.5" : "w-0.5 h-4"
        )}
      />
    </button>
  );
}
