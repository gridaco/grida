import React, { useRef } from "react";
import { useInViewport } from "react-in-viewport";

export function LazyFrame({
  children,
  placeholder,
  xy,
  size,
}: { children: React.ReactNode } & {
  placeholder: React.ReactNode;
  xy: [number, number];
  size: { width: number; height: number };
}) {
  const visibilityRef = useRef();
  const { inViewport, enterCount } = useInViewport(visibilityRef);

  return (
    <div
      style={{
        pointerEvents: "none",
        position: "absolute",
        left: xy[0],
        top: xy[1],
        width: size.width,
        height: size.height,
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
