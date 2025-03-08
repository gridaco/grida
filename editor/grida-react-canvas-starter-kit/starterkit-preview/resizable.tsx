"use client";
import React, { useEffect, useState } from "react";
import { cn } from "@/utils";
import { cmath } from "@grida/cmath";
import { useMeasure } from "@uidotdev/usehooks";
import { useGesture } from "@use-gesture/react";

function Resizable({
  fullscreen = false,
  min = { width: 100, height: 100 },
  initial = { width: 500, height: 500 },
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  fullscreen?: boolean;
  min?: { width: number; height: number };
  initial?: { width: number; height: number };
}) {
  const [containerRef, containerSize] = useMeasure();
  const [size, setSize] = useState(initial);

  // Ensure initial size meets minimum
  useEffect(() => {
    if (containerSize.width === null || containerSize.height === null) return;
    setSize((prev) => ({
      width: Math.max(min.width, prev.width),
      height: Math.max(min.height, prev.height),
    }));
  }, [containerSize.width, containerSize.height]);

  // Adjust size on container resize to avoid overflow (after resize completes)
  useEffect(() => {
    if (containerSize.width === null || containerSize.height === null) return;
    const timeout = setTimeout(() => {
      setSize((prev) => ({
        width: cmath.clamp(
          prev.width,
          min.width,
          containerSize.width ?? Infinity
        ),
        height: cmath.clamp(
          prev.height,
          min.height,
          containerSize.height ?? Infinity
        ),
      }));
    }, 300);
    return () => clearTimeout(timeout);
  }, [containerSize.width, containerSize.height]);

  // Left handle: decrease width
  const bindHorizontalLeft = useGesture(
    {
      onDrag: ({ delta: [dx] }) => {
        setSize((prev) => ({
          ...prev,
          width: cmath.clamp(
            prev.width - dx * 2,
            min.width,
            containerSize.width ?? Infinity
          ),
        }));
      },
    },
    { drag: { axis: "x" } }
  );

  // Right handle: increase width
  const bindHorizontalRight = useGesture(
    {
      onDrag: ({ delta: [dx] }) => {
        setSize((prev) => ({
          ...prev,
          width: cmath.clamp(
            prev.width + dx * 2,
            min.width,
            containerSize.width ?? Infinity
          ),
        }));
      },
    },
    { drag: { axis: "x" } }
  );

  // Bottom handle: increase height
  const bindVertical = useGesture(
    {
      onDrag: ({ delta: [, dy] }) =>
        setSize((prev) => ({
          ...prev,
          height: cmath.clamp(
            prev.height + dy * 2,
            min.height,
            containerSize.height ?? Infinity
          ),
        })),
    },
    { drag: { axis: "y" } }
  );

  return (
    <div
      data-fullscreen={fullscreen}
      {...props}
      className={cn(
        "group relative w-full h-full p-8 data-[fullscreen=true]:p-0",
        className
      )}
    >
      <div
        ref={containerRef}
        className="w-full h-full flex flex-col items-center justify-center"
      >
        <div
          id="resizable"
          className="relative"
          style={
            fullscreen
              ? { width: "100%", height: "100%" }
              : {
                  width: size.width,
                  height: size.height,
                }
          }
        >
          {children}
          {/* Left resize handle */}
          <div
            aria-description="vertical-resize"
            data-direction="left"
            {...bindHorizontalLeft()}
            className="absolute -left-4 top-0 bottom-0 w-2 flex items-center cursor-ew-resize"
          >
            <button className="w-1 h-16 bg-ring/50 rounded-full hover:bg-ring transition-colors cursor-ew-resize" />
          </div>
          {/* Right resize handle */}
          <div
            aria-description="vertical-resize"
            data-direction="right"
            {...bindHorizontalRight()}
            className="absolute -right-4 top-0 bottom-0 w-2 flex items-center cursor-ew-resize"
          >
            <button className="w-1 h-16 bg-ring/50 rounded-full hover:bg-ring transition-colors cursor-ew-resize" />
          </div>
          {/* Bottom resize handle */}
          <div
            aria-description="bottom-resize"
            {...bindVertical()}
            className="absolute -bottom-4 left-0 right-0 h-2 flex justify-center cursor-ns-resize"
          >
            <button className="h-1 w-16 bg-ring/50 rounded-full hover:bg-ring transition-colors cursor-ns-resize" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Resizable;
