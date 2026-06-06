import React from "react";

/**
 * Tangent-mirroring mode glyph — `All`: the anchor's two bezier handles mirror
 * in both angle and length. A vector-editing affordance with no mainstream
 * equivalent.
 *
 * Shape only: colors via `currentColor` (override with the `stroke` prop). 64×64.
 */
export default function MirroringAllIcon({
  width = 64,
  height = 64,
  stroke = "currentColor",
  label = "Mirroring All icon",
  ...props
}: React.SVGProps<SVGSVGElement> & {
  stroke?: string;
  label?: string;
}) {
  const cx = 32;
  const cy = 24;
  const rAnchor = 4;
  const knobR = 2.5;
  const strokeWidth = 2;

  // Perfect mirror: same angle and length
  const leftX = 16;
  const leftY = cy;
  const rightX = 48;
  const rightY = cy;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 64 64"
      width={width}
      height={height}
      {...props}
    >
      <g
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <line x1={cx} y1={cy} x2={leftX} y2={leftY} />
        <line x1={cx} y1={cy} x2={rightX} y2={rightY} />
        <circle cx={leftX} cy={leftY} r={knobR} fill={stroke} />
        <circle cx={rightX} cy={rightY} r={knobR} fill={stroke} />
        <circle cx={cx} cy={cy} r={rAnchor} />
        <line x1={cx} y1={cy + rAnchor} x2={cx} y2={cy + 16} />
        <path
          d={`M ${cx} ${cy + 6} C ${cx + 6} ${cy + 18}, ${cx + 14} ${cy + 16}, ${cx + 22} ${cy + 14}`}
        />
      </g>
    </svg>
  );
}
