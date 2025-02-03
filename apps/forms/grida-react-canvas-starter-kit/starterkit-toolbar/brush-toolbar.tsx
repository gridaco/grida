"use client";
import React, { useState, useRef, useCallback, useEffect } from "react";

import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/utils";
import { useEventTarget } from "@/grida-react-canvas/provider";
import {
  DotIcon,
  DotsHorizontalIcon,
  TransparencyGridIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BitmapEditorBrush,
  BitmapEditorRuntimeBrush,
  createGrainBrushTexture,
  createSprayBrushTexture,
  createSquarePixelBrushTexture,
} from "@grida/bitmap";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

export function useSliderState() {
  const [active, setActive] = useState(false);

  const onValueChange = useCallback(() => {
    setActive(true);
  }, []);

  const onValueCommit = useCallback(() => {
    setActive(false);
  }, []);

  return {
    active,
    onValueChange,
    onValueCommit,
  };
}

export default function BrushToolbar() {
  const { cursor_mode, changeBrush, changeBrushSize, changeBrushOpacity } =
    useEventTarget();

  const sizepop = useSliderState();
  const opacitypop = useSliderState();

  if (cursor_mode.type !== "brush") return null;

  const { size, opacity } = cursor_mode.brush;

  return (
    <div className="w-10 flex flex-col items-start gap-2 p-1 border bg-background/50 backdrop-blur-lg shadow rounded-md pointer-events-auto">
      {/* Paint Brush Size */}
      <Popover open={sizepop.active}>
        <PopoverAnchor className="w-full">
          <div className="w-full h-40">
            <VerticalSlider
              min={1}
              max={100}
              value={size ? [size[0]] : undefined}
              onValueCommit={() => {
                sizepop.onValueCommit();
              }}
              onValueChange={(values) => {
                sizepop.onValueChange();
                changeBrushSize({ type: "set", value: values[0] });
              }}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          side="right"
          align="center"
          sideOffset={8}
          className="w-40 h-40 p-0 overflow-hidden"
        >
          <BrushPreview brush={cursor_mode.brush} label={<>Size</>} />
        </PopoverContent>
      </Popover>
      <Popover open={opacitypop.active}>
        <PopoverAnchor className="w-full">
          <div className="w-full h-40">
            <VerticalSlider
              min={1}
              max={100}
              value={[opacity * 100]}
              onValueCommit={() => {
                opacitypop.onValueCommit();
              }}
              onValueChange={(values) => {
                opacitypop.onValueChange();
                const v = values[0] / 100;
                changeBrushOpacity({ type: "set", value: v });
              }}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          side="right"
          align="center"
          sideOffset={8}
          className="w-40 h-40 p-0 overflow-hidden"
        >
          <BrushPreview
            brush={cursor_mode.brush}
            label={
              <>
                <span className="font-bold">Opacity</span>
                <span className="ms-2">
                  {Math.round(cursor_mode.brush.opacity * 100) + "%"}
                </span>
              </>
            }
          />
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild className="w-full">
          <Button size="xs" variant="ghost" className="p-1">
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
  );
}

function BrushPreview({
  brush,
  label,
}: {
  brush: Omit<BitmapEditorRuntimeBrush, "color">;
  label: React.ReactNode;
}) {
  return (
    <div className="relative w-full h-full flex items-center justify-center rounded overflow-hidden">
      <TransparencyGridIcon className="absolute inset-0 w-full h-full opacity-20" />
      <div className="absolute top-2 left-2 z-10">
        <span className="text-muted-foreground text-xs">{label}</span>
      </div>
      <div
        style={{
          borderRadius: "100%",
          width: brush.size[0],
          height: brush.size[1],
          background: "black",
          opacity: brush.opacity,
        }}
      />
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
