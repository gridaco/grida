"use client";
import React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/utils";
import { useEventTarget } from "@/grida-react-canvas/provider";
import { DotIcon, DotsHorizontalIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createGrainBrushTexture,
  createSprayBrushTexture,
  createSquarePixelBrushTexture,
} from "@grida/bitmap";

export default function BrushToolbar() {
  const { cursor_mode, changeBrush, changeBrushSize, changeBrushOpacity } =
    useEventTarget();

  if (cursor_mode.type !== "brush") return null;

  const { size, opacity } = cursor_mode.brush;

  return (
    <div className="w-full flex flex-col items-start gap-2 p-1 border bg-background/50 backdrop-blur-lg shadow rounded-md pointer-events-auto">
      {/* Paint Brush Size */}
      <div className="w-full h-40">
        <VerticalSlider
          min={1}
          max={100}
          value={size ? [size[0]] : undefined}
          onValueChange={(values) =>
            changeBrushSize({ type: "set", value: values[0] })
          }
        />
      </div>
      <div className="w-full h-40">
        {/* opacity */}
        <VerticalSlider
          min={1}
          max={100}
          value={[opacity * 100]}
          onValueChange={(values) => {
            const v = values[0] / 100;
            changeBrushOpacity({ type: "set", value: v });
          }}
        />
      </div>
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost">
              <DotsHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onSelect={() => {
                changeBrush({
                  blend: "source-over",
                  hardness: 1,
                  size: [40, 40],
                  spacing: 10,
                  texture: createSprayBrushTexture(40, 40, 0.1),
                });
              }}
            >
              Spray Brush
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                changeBrush({
                  blend: "source-over",
                  hardness: 1,
                  size: [100, 100],
                  spacing: 10,
                  texture: createGrainBrushTexture(100, 100, 0.1),
                });
              }}
            >
              Grain Brush
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                changeBrush({
                  blend: "source-over",
                  hardness: 1,
                  size: [8, 8],
                  spacing: 1,
                  texture: createSquarePixelBrushTexture(8),
                });
              }}
            >
              Pixel Brush
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
