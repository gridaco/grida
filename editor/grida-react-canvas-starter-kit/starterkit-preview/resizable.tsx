"use client";
import React, { useEffect, useState } from "react";
import { cn } from "@/utils";
import { cmath } from "@grida/cmath";
import { useMeasure } from "@uidotdev/usehooks";
import { useGesture } from "@use-gesture/react";

type Size = { width: number; height: number };

interface ResizableProps extends React.HTMLAttributes<HTMLDivElement> {
  fullscreen?: boolean;
  min?: Size;
  initial?: Size;
  value?: Size;
  onValueChange?: (value: Size) => void;
  step?: number;
}

function Resizable({
  fullscreen = false,
  min = { width: 100, height: 100 },
  initial = { width: 500, height: 500 },
  value,
  onValueChange,
  children,
  className,
  step = 1,
  ...props
}: ResizableProps) {
  const [containerRef, containerSize] = useMeasure();
  const [internalSize, setInternalSize] = useState(initial);
  const currentSize = value || internalSize;

  useEffect(() => {
    if (containerSize.width === null || containerSize.height === null) return;
    if (!value) {
      setInternalSize((prev) => ({
        width: Math.max(min.width, prev.width),
        height: Math.max(min.height, prev.height),
      }));
    }
  }, [containerSize.width, containerSize.height, value]);

  useEffect(() => {
    if (containerSize.width === null || containerSize.height === null) return;
    if (!value) {
      const timeout = setTimeout(() => {
        setInternalSize((prev) => ({
          width: cmath.quantize(
            cmath.clamp(prev.width, min.width, containerSize.width ?? Infinity),
            step
          ),
          height: cmath.quantize(
            cmath.clamp(
              prev.height,
              min.height,
              containerSize.height ?? Infinity
            ),
            step
          ),
        }));
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [containerSize.width, containerSize.height, value]);

  const updateSize = (newSize: Partial<Size>) => {
    const updated = { ...currentSize, ...newSize };
    if (onValueChange) {
      onValueChange(updated);
    } else {
      setInternalSize(updated);
    }
  };

  const bindHorizontalLeft = useGesture(
    {
      onDrag: ({ delta: [dx] }) =>
        updateSize({
          width: cmath.quantize(
            cmath.clamp(
              currentSize.width - dx * 2,
              min.width,
              containerSize.width ?? Infinity
            ),
            step
          ),
        }),
    },
    { drag: { axis: "x" } }
  );

  const bindHorizontalRight = useGesture(
    {
      onDrag: ({ delta: [dx] }) =>
        updateSize({
          width: cmath.quantize(
            cmath.clamp(
              currentSize.width + dx * 2,
              min.width,
              containerSize.width ?? Infinity
            ),
            step
          ),
        }),
    },
    { drag: { axis: "x" } }
  );

  const bindVertical = useGesture(
    {
      onDrag: ({ delta: [, dy] }) =>
        updateSize({
          height: cmath.quantize(
            cmath.clamp(
              currentSize.height + dy * 2,
              min.height,
              containerSize.height ?? Infinity
            ),
            step
          ),
        }),
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
              : { width: currentSize.width, height: currentSize.height }
          }
        >
          {children}
          <div
            aria-description="vertical-resize"
            data-direction="left"
            {...bindHorizontalLeft()}
            className="absolute -left-4 top-0 bottom-0 w-2 flex items-center cursor-ew-resize"
          >
            <button className="w-1 h-16 bg-ring/50 rounded-full hover:bg-ring transition-colors cursor-ew-resize" />
          </div>
          <div
            aria-description="vertical-resize"
            data-direction="right"
            {...bindHorizontalRight()}
            className="absolute -right-4 top-0 bottom-0 w-2 flex items-center cursor-ew-resize"
          >
            <button className="w-1 h-16 bg-ring/50 rounded-full hover:bg-ring transition-colors cursor-ew-resize" />
          </div>
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
