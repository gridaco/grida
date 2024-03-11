import React, { useRef } from "react";
import { useInViewport } from "react-in-viewport";

export function LazyFrame({
  children,
  xy,
  size,
}: { children: React.ReactNode } & {
  xy: [number, number];
  size: { width: number; height: number };
}) {
  const visibilityRef = useRef<HTMLDivElement>(null);
  const { inViewport, enterCount } = useInViewport(visibilityRef);
  const [x, y] = xy;

  // const opt_scale = 1; // 1 / zoom;  scale(${opt_scale})
  const opt_w = size.width; // size.width * zoom;
  const opt_h = size.height; // size.height * zoom;

  return (
    <div
      id="frame"
      style={{
        pointerEvents: "none",
        transition: "opacity 50ms ease-out 0s",
        transformOrigin: "left top",
        transform: `translate3d(${x}px, ${y}px, 0)`,
        willChange: "transform",
        display: "block",
        position: "fixed",
        width: opt_w,
        height: opt_h,
        backgroundColor: inViewport ? undefined : "grey",
        backdropFilter: "none!important",
      }}
      ref={visibilityRef}
    >
      {enterCount > 0 && (
        <div
          style={{
            width: "100%",
            height: "100%",
            contentVisibility: inViewport ? "visible" : "hidden",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
