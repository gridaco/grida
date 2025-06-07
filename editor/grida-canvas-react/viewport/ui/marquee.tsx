"use client";
import React, { useMemo } from "react";
import cmath from "@grida/cmath";

/**
 * A marquee is a area where it takes two points, where it uses the min point as min and max point as max.
 * - a: [x1, y1]
 * - b: [x2, y2]
 */
type Marquee = {
  a: cmath.Vector2;
  b: cmath.Vector2;
};

export function MarqueeArea({
  a,
  b,
  color,
}: Marquee & {
  color?: { hue: string; fill: string };
}) {
  const r = useMemo(() => cmath.rect.fromPoints([a, b]), [a, b]);

  return (
    <div
      className="absolute border border-workbench-accent-sky bg-workbench-accent-sky/20 pointer-events-none z-50"
      style={{
        left: r.x,
        top: r.y,
        width: r.width,
        height: r.height,
        borderColor: color ? color.hue : undefined,
        backgroundColor: color ? color.fill : undefined,
      }}
    />
  );
}

export function Vector4Area({
  area: [ax, ay, bx, by],
  style,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement> & {
  area: cmath.Vector4;
}) {
  const r = useMemo(
    () =>
      cmath.rect.fromPoints([
        [ax, ay],
        [bx, by],
      ]),
    [ax, ay, bx, by]
  );

  return (
    <div
      {...props}
      style={{
        ...style,
        left: r.x,
        top: r.y,
        width: r.width,
        height: r.height,
      }}
    />
  );
}
