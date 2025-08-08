import React from "react";

export function MirroringAll({
  width = 64,
  height = 64,
  stroke = "#6b7280",
  label = "Mirroring All icon",
  ...props
}: React.SVGProps<SVGSVGElement> & {
  stroke?: string;
  label?: string;
}) {
  // Shared anchor position and styling
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
        {/* handle lines (same angle and length) */}
        <line x1={cx} y1={cy} x2={leftX} y2={leftY} />
        <line x1={cx} y1={cy} x2={rightX} y2={rightY} />

        {/* handle knobs */}
        <circle cx={leftX} cy={leftY} r={knobR} fill={stroke} />
        <circle cx={rightX} cy={rightY} r={knobR} fill={stroke} />

        {/* anchor base circle */}
        <circle cx={cx} cy={cy} r={rAnchor} fill="#ffffff" />

        {/* short vertical from the anchor */}
        <line x1={cx} y1={cy + rAnchor} x2={cx} y2={cy + 16} />

        {/* rightward curve (identical across all icons) */}
        <path
          d={`M ${cx} ${cy + 6} C ${cx + 6} ${cy + 18}, ${cx + 14} ${cy + 16}, ${cx + 22} ${cy + 14}`}
        />
      </g>
    </svg>
  );
}

export function MirroringAngle({
  width = 64,
  height = 64,
  stroke = "#6b7280",
  label = "Mirroring Angle icon",
  ...props
}: React.SVGProps<SVGSVGElement> & {
  stroke?: string;
  label?: string;
}) {
  // Shared anchor position and styling
  const cx = 32;
  const cy = 24;
  const rAnchor = 4;
  const knobR = 2.5;
  const strokeWidth = 2;

  // Colinear handles (same angle), but clearly different lengths
  // Left length = 12 (short), Right length = 26 (long)
  const leftX = 20;
  const leftY = cy;
  const rightX = 58;
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
        {/* handle lines (colinear through the anchor) */}
        <line x1={cx} y1={cy} x2={leftX} y2={leftY} />
        <line x1={cx} y1={cy} x2={rightX} y2={rightY} />

        {/* handle knobs */}
        <circle cx={leftX} cy={leftY} r={knobR} fill={stroke} />
        <circle cx={rightX} cy={rightY} r={knobR} fill={stroke} />

        {/* anchor base circle */}
        <circle cx={cx} cy={cy} r={rAnchor} fill="#ffffff" />

        {/* short vertical from the anchor */}
        <line x1={cx} y1={cy + rAnchor} x2={cx} y2={cy + 16} />

        {/* rightward curve (identical across all icons) */}
        <path
          d={`M ${cx} ${cy + 6} C ${cx + 6} ${cy + 18}, ${cx + 14} ${cy + 16}, ${cx + 22} ${cy + 14}`}
        />
      </g>
    </svg>
  );
}

export function MirroringNone({
  width = 64,
  height = 64,
  stroke = "#6b7280",
  label = "Mirroring None icon",
  ...props
}: React.SVGProps<SVGSVGElement> & {
  stroke?: string;
  label?: string;
}) {
  // Shared anchor position and styling
  const cx = 32;
  const cy = 24;
  const rAnchor = 4;
  const knobR = 2.5;
  const strokeWidth = 2;

  // Independent handles (different angles and lengths)
  // Left handle: ~140°, length ~14
  const leftX = 21.3;
  const leftY = 33.0;
  // Right handle: ~340°, length ~22
  const rightX = 52.7;
  const rightY = 16.5;

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
        {/* handle lines */}
        <line x1={cx} y1={cy} x2={leftX} y2={leftY} />
        <line x1={cx} y1={cy} x2={rightX} y2={rightY} />

        {/* handle knobs */}
        <circle cx={leftX} cy={leftY} r={knobR} fill={stroke} />
        <circle cx={rightX} cy={rightY} r={knobR} fill={stroke} />

        {/* anchor base circle */}
        <circle cx={cx} cy={cy} r={rAnchor} fill="#ffffff" />

        {/* short vertical from the anchor */}
        <line x1={cx} y1={cy + rAnchor} x2={cx} y2={cy + 16} />

        {/* rightward curve (identical across all icons) */}
        <path
          d={`M ${cx} ${cy + 6} C ${cx + 6} ${cy + 18}, ${cx + 14} ${cy + 16}, ${cx + 22} ${cy + 14}`}
        />
      </g>
    </svg>
  );
}
