"use client";
import { useId } from "react";

/**
 * Linear-gradient paint-type swatch. Shape only: a single `currentColor` at
 * 0.2 → 0.8 opacity (the gradient is opacity, not a second hue) inside a
 * full-opacity outline ring, so the shape reads on any background and a single
 * consumer color drives it. No frame/state — the host supplies those. Client-
 * only for the collision-free gradient id. See README.
 */
export default function LinearGradientPaintIcon({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  const id = useId();
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
        <linearGradient
          id={id}
          x1={8}
          y1={0.5}
          x2={8}
          y2={15.5}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset={0} stopColor="currentColor" stopOpacity={0.2} />
          <stop offset={1} stopColor="currentColor" stopOpacity={0.8} />
        </linearGradient>
      </defs>
      <circle
        cx={8}
        cy={8}
        r={7.5}
        strokeWidth={1}
        stroke="currentColor"
        fill={`url(#${id})`}
      />
    </svg>
  );
}
