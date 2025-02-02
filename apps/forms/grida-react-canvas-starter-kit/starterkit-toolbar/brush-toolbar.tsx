"use client";
import React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/utils";
import { useEventTarget } from "@/grida-react-canvas/provider";

export default function BrushToolbar() {
  const { cursor_mode, changeBrushSize } = useEventTarget();

  if (cursor_mode.type !== "brush") return null;

  const { size } = cursor_mode.brush;

  return (
    <div className="w-full h-72 flex flex-col items-start gap-2 p-1 border bg-background/50 backdrop-blur-lg shadow rounded-md pointer-events-auto">
      {/* Paint Brush Size */}
      <div className="w-8 h-full">
        <VerticalSlider
          min={1}
          max={36}
          value={size ? [size] : undefined}
          onValueChange={(values) =>
            changeBrushSize?.({ type: "set", value: values[0] })
          }
        />
      </div>
    </div>
  );
}

const VerticalSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-full w-full touch-none select-none items-center",
      className
    )}
    orientation="vertical"
    {...props}
  >
    <SliderPrimitive.Track className="relative h-full w-2 grow overflow-hidden rounded bg-primary/10">
      <SliderPrimitive.Range className="absolute w-full bg-transparent" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-3 w-8 rounded border shadow bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
VerticalSlider.displayName = SliderPrimitive.Root.displayName;
