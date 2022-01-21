import React, { useRef } from "react";
import { useInViewport } from "react-in-viewport";

export function LazyFrame({
  children,
  placeholder,
  xy,
  size,
  zoom,
}: { children: React.ReactNode } & {
  placeholder: React.ReactNode;
  xy: [number, number];
  size: { width: number; height: number };
  zoom: number;
}) {
  const visibilityRef = useRef();
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
        transform: `translateX(${x}px) translateY(${y}px)`,
        willChange: "transform",
        display: "block",
        position: "fixed",
        width: opt_w,
        height: opt_h,
      }}
      ref={visibilityRef}
    >
      <div
        style={{
          top: 0,
          left: 0,
          position: "absolute",
          zIndex: -1,
        }}
      >
        {placeholder}
      </div>
      {enterCount > 0 && (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: inViewport ? undefined : "none",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
