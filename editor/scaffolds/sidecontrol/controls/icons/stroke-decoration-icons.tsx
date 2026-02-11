/**
 * SVG icons for stroke decoration presets.
 *
 * Proportions match the Rust shape spec (crates/grida-canvas/src/shape/marker.rs):
 * - Arrow lines: right-triangle, arms 45° (depth = size, half_h = size); scaled to fit.
 * - Triangle: depth = s*1.5, half_h = s*0.866, s = size*0.8.
 * - Circle: r = size*0.6, depth = 2r.
 * - Square: half = size*0.6, side = 1.2*size.
 * - Diamond: s = size*0.85, depth = 2s, half_h = s.
 * - Vertical bar: width = stroke_width, height = 5*stroke_width.
 *
 * ## Rendering modes
 *
 * **Fixed (dropdown items):** single SVG with viewBox 0 0 24 24; line + marker in one image.
 *
 * **Responsive (select trigger):** CSS flex layout — a growing `<div>` line +
 * a fixed-size marker SVG.  Only the line stretches; the marker keeps its
 * proportions regardless of container width.
 */

import React from "react";
import { cn } from "@/components/lib/utils";
import type cg from "@grida/cg";

// ── Fixed-size icon constants ────────────────────────────────────────────────

const VB = "0 0 24 24";
const LINE_X1 = 2;
const LINE_X2 = 10;
/** Line extends slightly into marker zone to remove gap at join */
const LINE_X2_JOIN = 11;
const LINE_Y = 12;
const LINE_STROKE = 2;

/** Marker zone depth (tip at 24, base at 10) */
const DEPTH = 14;

const svgProps = {
  viewBox: VB,
  preserveAspectRatio: "xMidYMid meet" as const,
  "aria-hidden": true,
};

const iconSlotClass = "size-4 shrink-0";

function LineSegment({ toJoin = false }: { toJoin?: boolean }) {
  const x2 = toJoin ? LINE_X2_JOIN : LINE_X2;
  return (
    <line
      x1={LINE_X1}
      y1={LINE_Y}
      x2={x2}
      y2={LINE_Y}
      stroke="currentColor"
      strokeWidth={LINE_STROKE}
      strokeLinecap="butt"
    />
  );
}

// ── Fixed-size icon components (for dropdown items) ──────────────────────────

export function StrokeDecorationNoneIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <svg {...svgProps} className={cn(iconSlotClass, className)} fill="none">
      <line
        x1={LINE_X1}
        y1={LINE_Y}
        x2={22}
        y2={LINE_Y}
        stroke="currentColor"
        strokeWidth={LINE_STROKE}
        strokeLinecap="butt"
      />
    </svg>
  );
}

export function StrokeDecorationArrowLinesIcon({
  className,
}: {
  className?: string;
}) {
  const baseX = 24 - DEPTH;
  const halfH = DEPTH * 0.78;
  const A = { x: baseX, y: LINE_Y - halfH };
  const B = { x: 24, y: LINE_Y };
  const C = { x: baseX, y: LINE_Y + halfH };
  const D = { x: baseX, y: LINE_Y };
  return (
    <svg {...svgProps} className={cn(iconSlotClass, className)} fill="none">
      <LineSegment />
      <path
        d={`M${A.x} ${A.y} L${B.x} ${B.y} L${C.x} ${C.y} L${B.x} ${B.y} L${D.x} ${D.y}`}
        stroke="currentColor"
        strokeWidth={LINE_STROKE}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function StrokeDecorationTriangleFilledIcon({
  className,
}: {
  className?: string;
}) {
  const depth = DEPTH;
  const s = depth / 1.5;
  const halfH = s * 0.866;
  const baseX = 24 - depth;
  return (
    <svg
      {...svgProps}
      className={cn(iconSlotClass, className)}
      fill="currentColor"
    >
      <LineSegment toJoin />
      <path
        d={`M24 ${LINE_Y} L${baseX} ${LINE_Y - halfH} L${baseX} ${LINE_Y + halfH} Z`}
      />
    </svg>
  );
}

export function StrokeDecorationCircleFilledIcon({
  className,
}: {
  className?: string;
}) {
  const r = DEPTH / 2;
  const cx = 24 - r;
  return (
    <svg
      {...svgProps}
      className={cn(iconSlotClass, className)}
      fill="currentColor"
    >
      <LineSegment toJoin />
      <circle cx={cx} cy={LINE_Y} r={r} />
    </svg>
  );
}

export function StrokeDecorationSquareFilledIcon({
  className,
}: {
  className?: string;
}) {
  const half = (DEPTH / 1.2) * 0.6;
  const side = half * 2;
  const left = 24 - side;
  const top = LINE_Y - half;
  return (
    <svg
      {...svgProps}
      className={cn(iconSlotClass, className)}
      fill="currentColor"
    >
      <LineSegment toJoin />
      <rect x={left} y={top} width={side} height={side} />
    </svg>
  );
}

export function StrokeDecorationDiamondFilledIcon({
  className,
}: {
  className?: string;
}) {
  const s = DEPTH / 2;
  const tip = { x: 24, y: LINE_Y };
  const left = { x: 24 - s * 2, y: LINE_Y };
  const top = { x: 24 - s, y: LINE_Y - s };
  const bottom = { x: 24 - s, y: LINE_Y + s };
  return (
    <svg
      {...svgProps}
      className={cn(iconSlotClass, className)}
      fill="currentColor"
    >
      <LineSegment toJoin />
      <path
        d={`M${tip.x} ${tip.y} L${top.x} ${top.y} L${left.x} ${left.y} L${bottom.x} ${bottom.y} Z`}
      />
    </svg>
  );
}

export function StrokeDecorationVerticalBarFilledIcon({
  className,
}: {
  className?: string;
}) {
  const w = LINE_STROKE * 1.4;
  const h = w * 5;
  const left = 24 - w;
  const top = LINE_Y - h / 2;
  const bottom = LINE_Y + h / 2;
  return (
    <svg {...svgProps} className={cn(iconSlotClass, className)} fill="none">
      <LineSegment />
      <path
        d={`M${LINE_X2} ${LINE_Y} L${left} ${LINE_Y} L${left} ${top} L24 ${top} L24 ${bottom} L${left} ${bottom} L${left} ${LINE_Y}`}
        stroke="currentColor"
        strokeWidth={LINE_STROKE}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

// ── Marker-only SVGs (for responsive layout) ────────────────────────────────
//
// These render *only* the marker shape, no line. They are placed at the end of
// a flex row; a growing <div> provides the line.
//
// Each marker SVG uses a tight viewBox so the shape is pixel-crisp and never
// distorted.

/** Marker size in the responsive layout (matches h-4 = 16px). */
const M = 16;
const M_CY = M / 2;
const M_STROKE = 1.5;

function MarkerArrowLines() {
  // Chevron-style open arrow pointing right
  const armLen = M * 0.45;
  return (
    <svg
      viewBox={`0 0 ${M} ${M}`}
      className="h-full w-auto shrink-0"
      fill="none"
      aria-hidden
    >
      <path
        d={`M${M / 2 - armLen * 0.6} ${M_CY - armLen} L${M / 2 + armLen * 0.6} ${M_CY} L${M / 2 - armLen * 0.6} ${M_CY + armLen}`}
        stroke="currentColor"
        strokeWidth={M_STROKE}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function MarkerTriangleFilled() {
  const depth = M * 0.6;
  const halfH = depth * 0.58;
  const tipX = M / 2 + depth / 2;
  const baseX = M / 2 - depth / 2;
  return (
    <svg
      viewBox={`0 0 ${M} ${M}`}
      className="h-full w-auto shrink-0"
      fill="currentColor"
      aria-hidden
    >
      <path
        d={`M${tipX} ${M_CY} L${baseX} ${M_CY - halfH} L${baseX} ${M_CY + halfH} Z`}
      />
    </svg>
  );
}

function MarkerCircleFilled() {
  const r = M * 0.25;
  return (
    <svg
      viewBox={`0 0 ${M} ${M}`}
      className="h-full w-auto shrink-0"
      fill="currentColor"
      aria-hidden
    >
      <circle cx={M / 2} cy={M_CY} r={r} />
    </svg>
  );
}

function MarkerSquareFilled() {
  const side = M * 0.4;
  return (
    <svg
      viewBox={`0 0 ${M} ${M}`}
      className="h-full w-auto shrink-0"
      fill="currentColor"
      aria-hidden
    >
      <rect
        x={M / 2 - side / 2}
        y={M_CY - side / 2}
        width={side}
        height={side}
      />
    </svg>
  );
}

function MarkerDiamondFilled() {
  const s = M * 0.28;
  const cx = M / 2;
  return (
    <svg
      viewBox={`0 0 ${M} ${M}`}
      className="h-full w-auto shrink-0"
      fill="currentColor"
      aria-hidden
    >
      <path
        d={`M${cx + s} ${M_CY} L${cx} ${M_CY - s} L${cx - s} ${M_CY} L${cx} ${M_CY + s} Z`}
      />
    </svg>
  );
}

function MarkerVerticalBarFilled() {
  const w = M_STROKE * 1.2;
  const h = M * 0.6;
  const cx = M / 2;
  return (
    <svg
      viewBox={`0 0 ${M} ${M}`}
      className="h-full w-auto shrink-0"
      fill="currentColor"
      aria-hidden
    >
      <rect x={cx - w / 2} y={M_CY - h / 2} width={w} height={h} />
    </svg>
  );
}

const markerByValue: Record<cg.StrokeDecoration, React.ReactNode | null> = {
  none: null,
  arrow_lines: <MarkerArrowLines />,
  triangle_filled: <MarkerTriangleFilled />,
  circle_filled: <MarkerCircleFilled />,
  square_filled: <MarkerSquareFilled />,
  diamond_filled: <MarkerDiamondFilled />,
  vertical_bar_filled: <MarkerVerticalBarFilled />,
};

// ── Lookup tables ────────────────────────────────────────────────────────────

const iconByValue: Record<cg.StrokeDecoration, React.ReactNode> = {
  none: <StrokeDecorationNoneIcon />,
  arrow_lines: <StrokeDecorationArrowLinesIcon />,
  triangle_filled: <StrokeDecorationTriangleFilledIcon />,
  circle_filled: <StrokeDecorationCircleFilledIcon />,
  square_filled: <StrokeDecorationSquareFilledIcon />,
  diamond_filled: <StrokeDecorationDiamondFilledIcon />,
  vertical_bar_filled: <StrokeDecorationVerticalBarFilledIcon />,
};

// ── Composite components ─────────────────────────────────────────────────────

/**
 * Renders the icon for a decoration value. When variant is "start", the icon
 * is flipped so the marker appears on the left (for Start endpoint UI).
 */
export function StrokeDecorationIcon({
  value,
  variant = "end",
  className,
}: {
  value: cg.StrokeDecoration;
  variant?: "start" | "end";
  className?: string;
}) {
  const icon = iconByValue[value];
  if (!icon) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center",
        variant === "start" && "scale-x-[-1]",
        className
      )}
    >
      {icon}
    </span>
  );
}

/**
 * Responsive trigger icon: a CSS flex row where the **line stretches** to fill
 * available width while the **marker keeps fixed proportions**.
 *
 * Layout (end variant, LTR):
 *   [ ———————————— line (flex-1) ———————————— ][ marker (fixed) ]
 *
 * For "start" variant the whole thing is flipped with scale-x-[-1].
 *
 * Negative margins (`-mx-0.5`) let the line bleed into the trigger's
 * padding / gap so there is no visible gap between the line, the marker,
 * and the chevron.
 */
export function StrokeDecorationIconResponsive({
  value,
  variant = "end",
  className,
}: {
  value: cg.StrokeDecoration;
  variant?: "start" | "end";
  className?: string;
}) {
  const marker = markerByValue[value];

  return (
    <span
      className={cn(
        "flex h-4 w-full min-w-0 items-center",
        variant === "start" && "scale-x-[-1]",
        className
      )}
    >
      {/* Growing line segment */}
      <span className="flex h-full min-w-1 flex-1 items-center">
        <span className="h-[1.5px] w-full bg-current" />
      </span>
      {/* Fixed-size marker (or nothing for "none") */}
      {marker && (
        <span className="flex h-full shrink-0 items-center">{marker}</span>
      )}
    </span>
  );
}

export { iconByValue };
