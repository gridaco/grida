"use client";
import { useId } from "react";

/**
 * Diamond-gradient paint-type swatch: concentric diamonds (L1 / Manhattan
 * iso-contours) radiating from the center — light (0.2) at the middle to dark
 * (~0.8) at the rim. Built as non-overlapping evenodd rings so the translucent
 * bands never compound. Shape only: a single `currentColor` (opacity only),
 * clipped to and bounded by a full-opacity outline ring; no frame/state.
 * Client-only for the collision-free clip id. See README.
 */
const DIAMOND_BANDS = (() => {
  const N = 12;
  const c = 8;
  const T = 11; // outer half-diagonal; overshoots the r=7.5 circle, then clipped
  const TVIS = 7.5 * Math.SQRT2; // furthest visible L1 distance (the diagonals)
  const f = (n: number) => n.toFixed(3);
  const diamond = (t: number) =>
    `M${c} ${f(c - t)}L${f(c + t)} ${c}L${c} ${f(c + t)}L${f(c - t)} ${c}Z`;
  return Array.from({ length: N }, (_, k) => {
    const tOuter = (T * (k + 1)) / N;
    const tInner = (T * k) / N;
    const mid = (tOuter + tInner) / 2;
    const opacity = 0.2 + 0.6 * Math.min(mid / TVIS, 1);
    const d =
      k === 0 ? diamond(tOuter) : `${diamond(tOuter)}${diamond(tInner)}`;
    return { d, opacity };
  });
})();

export default function DiamondGradientPaintIcon({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  const clip = useId();
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx={8} cy={8} r={7.5} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {DIAMOND_BANDS.map((b, i) => (
          <path
            key={i}
            d={b.d}
            fillRule="evenodd"
            fill="currentColor"
            fillOpacity={b.opacity}
          />
        ))}
      </g>
      <circle
        cx={8}
        cy={8}
        r={7.5}
        fill="none"
        strokeWidth={1}
        stroke="currentColor"
      />
    </svg>
  );
}
