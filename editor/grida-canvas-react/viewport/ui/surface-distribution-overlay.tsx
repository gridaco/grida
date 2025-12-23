"use client";

import React, { useMemo, useState } from "react";
import { useGesture as __useGesture } from "@use-gesture/react";
import {
  useGestureState,
  useTransformState,
  useToolState,
} from "../../provider";
import { ColumnsIcon, RowsIcon } from "@radix-ui/react-icons";
import { ObjectsDistributionAnalysis } from "./distribution";
import cmath from "@grida/cmath";
import { useSurfaceGesture } from "../hooks/use-surface-gesture";
import { SVGPatternDiagonalStripe } from "./svg-fill-patterns";
import { cn } from "@/components/lib/utils";

export function GapOverlay({
  onGapGestureStart,
  offset,
  style,
  distribution,
}: {
  distribution: ObjectsDistributionAnalysis;
  offset?: cmath.Vector2;
  style?: React.CSSProperties;
} & {
  onGapGestureStart?: (axis: cmath.Axis) => void;
}) {
  const { transform } = useTransformState();

  const { x, y, rects: _rects } = distribution;

  // either one gap is hovered, used for controlling the "highlighted" state of the gap handle
  const [uxGapHover, setUxGapHover] = useState<cmath.Axis | undefined>(
    undefined
  );

  // rects in surface space
  const rects = useMemo(
    () => _rects.map((r) => cmath.rect.transform(r, transform)),
    [_rects, transform]
  );

  const gaps = useMemo(() => {
    if (rects.length < 2) return [];

    const result: Array<{
      axis: cmath.Axis;
      a: cmath.Rectangle;
      b: cmath.Rectangle;
    }> = [];

    if (x && x.gaps && x.gaps.length > 0) {
      const x_sorted = [...rects].sort((a, b) => a.x - b.x);
      for (let i = 0; i < x.gaps.length; i++) {
        result.push({
          axis: "x",
          a: x_sorted[i],
          b: x_sorted[i + 1],
        });
      }
    }

    if (y && y.gaps && y.gaps.length > 0) {
      const y_sorted = [...rects].sort((a, b) => a.y - b.y);
      for (let i = 0; i < y.gaps.length; i++) {
        result.push({
          axis: "y",
          a: y_sorted[i],
          b: y_sorted[i + 1],
        });
      }
    }

    return result;
  }, [rects, x, y]);

  return (
    <div
      style={style}
      className="pointer-events-none z-50 invisible group-hover:visible"
    >
      <div>
        {gaps.map((gap, i) => (
          <GapWithHandle
            key={`${gap.axis}-${i}`}
            highlighted={uxGapHover === gap.axis}
            a={gap.a}
            b={gap.b}
            axis={gap.axis}
            offset={offset}
            onGapGestureStart={onGapGestureStart}
            onPointerEnter={() => {
              setUxGapHover(gap.axis);
            }}
            onPointerLeave={() => {
              setUxGapHover(undefined);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function GapWithHandle({
  a,
  b,
  axis,
  offset = cmath.vector2.zero,
  highlighted,
  onGapGestureStart,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  a: cmath.Rectangle;
  b: cmath.Rectangle;
  axis: cmath.Axis;
  offset?: cmath.Vector2;
  highlighted?: boolean;
  onGapGestureStart?: (axis: cmath.Axis) => void;
}) {
  const { gesture } = useGestureState();
  const tool = useToolState();

  // Note: This handler is required because the gap overlay uses `pointer-events-auto`
  // to enable hover detection (showing the gap overlay on hover). Since it consumes
  // pointer events, we need to prevent default to avoid triggering selection changes
  // when clicking on the gap overlay region.
  const handlePointerDown = (event: React.PointerEvent) => {
    // Don't prevent default for insert/draw tools - they need pointer events
    if (tool.type === "insert" || tool.type === "draw") {
      return;
    }
    // For all other tools, prevent default to block selection changes
    event.preventDefault();
  };

  const r = useMemo(() => {
    const intersection = cmath.rect.axisProjectionIntersection([a, b], axis)!;

    if (!intersection) return null;

    let rect: cmath.Rectangle;
    if (axis === "x") {
      const x1 = a.x + a.width;
      const y1 = intersection[0];
      const x2 = b.x;
      const y2 = intersection[1];

      rect = cmath.rect.fromPoints([
        [x1, y1],
        [x2, y2],
      ]);
    } else {
      const x1 = intersection[0];
      const y1 = a.y + a.height;
      const x2 = intersection[1];
      const y2 = b.y;

      rect = cmath.rect.fromPoints([
        [x1, y1],
        [x2, y2],
      ]);
    }

    return cmath.rect.translate(rect, cmath.vector2.invert(offset));
  }, [a, b, axis, offset]);

  const is_gesture = gesture.type === "gap";

  if (!r) return null;

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: r.y,
          left: r.x,
          width: r.width,
          height: r.height,
        }}
        data-is-gesture={is_gesture}
        data-highlighted={highlighted}
        className={cn("group/gap pointer-events-auto", className)}
        onPointerDown={handlePointerDown}
        {...props}
      >
        <svg className="absolute inset-0 overflow-visible pointer-events-none">
          <SVGPatternDiagonalStripe
            id="gap-diagonal-stripes"
            className="text-workbench-accent-pink/50"
            patternWidth={1}
            patternSpacing={5}
          />
          {/* highlight pattern - only shown when gap is hovered, but hidden while dragging */}
          {/* while dragging, tinted fill is applied */}
          <rect
            x={0}
            y={0}
            width={r.width}
            height={r.height}
            className="fill-transparent group-data-[is-gesture=true]/gap:fill-workbench-accent-pink/20 group-data-[highlighted=true]/gap:fill-[url(#gap-diagonal-stripes)]"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
          }}
          className="opacity-100 group-data-[is-gesture='true']/gap:opacity-0"
        >
          <GapHandle axis={axis} onGapGestureStart={onGapGestureStart} />
        </div>
      </div>
    </>
  );
}

function GapHandle({
  axis,
  onGapGestureStart,
}: {
  axis: cmath.Axis;
  onGapGestureStart?: (axis: cmath.Axis) => void;
}) {
  const bind = useSurfaceGesture({
    onPointerDown: ({ event }) => {
      event.preventDefault();
    },
    onDragStart: ({ event }) => {
      event.preventDefault();
      onGapGestureStart?.(axis);
    },
  });

  return (
    <button
      {...bind()}
      className="p-1 pointer-events-auto"
      style={{
        transform:
          "translate(-50%, -50%) " + (axis === "y" ? "rotate(90deg)" : ""),
        touchAction: "none",
        cursor: axis === "x" ? "ew-resize" : "ns-resize",
      }}
    >
      <div
        className="
      w-0.5 h-4
      border border-pink-500
      hover:bg-pink-500
      ring-1 ring-white
      pointer-events-auto
      "
      />
    </button>
  );
}

export function DistributeButton({
  axis,
  onClick,
}: {
  axis: cmath.Axis | undefined;
  onClick?: (axis: cmath.Axis) => void;
}) {
  if (!axis) {
    return <></>;
  }

  return (
    <div className="absolute hidden group-hover:block bottom-1 right-1 z-50 pointer-events-auto">
      <button
        className="p-1 bg-workbench-accent-sky text-white rounded-sm pointer-events-auto"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(axis);
        }}
      >
        {axis === "x" ? <ColumnsIcon /> : <RowsIcon />}
      </button>
    </div>
  );
}
