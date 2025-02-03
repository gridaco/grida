"use client";
import React, { useState, useCallback } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/utils";
import { useEventTarget } from "@/grida-react-canvas/provider";
import {
  DotsHorizontalIcon,
  TransparencyGridIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { BitmapEditorBrush, BitmapEditorRuntimeBrush } from "@grida/bitmap";
import {
  createGrainBrushTexture,
  createSprayBrushTexture,
  createSquarePixelBrushTexture,
} from "@grida/bitmap/texture-factory";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

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
  const { tool, brush, changeBrush, changeBrushSize, changeBrushOpacity } =
    useEventTarget();

  const sizepop = useSliderState();
  const opacitypop = useSliderState();

  if (!(tool.type === "brush" || tool.type === "eraser")) return null;

  const { size, opacity } = brush;

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
          <BrushPreview brush={brush} label={<>Size</>} />
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
            brush={brush}
            label={
              <>
                <span className="font-bold">Opacity</span>
                <span className="ms-2">
                  {Math.round(brush.opacity * 100) + "%"}
                </span>
              </>
            }
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild className="w-full">
          <Button size="xs" variant="ghost" className="p-1">
            <DotsHorizontalIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="center"
          sideOffset={8}
          className="w-72 h-96 p-0 overflow-scroll"
        >
          <div className="flex flex-col p-4 gap-4">
            <div className="grid gap-2">
              <Label className="text-xs">Hardness</Label>
              <Slider min={0} max={100} />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Spacing</Label>
              <Slider min={0} max={100} />
            </div>
          </div>
          <hr />
          <div className="flex flex-col gap-1">
            <BrushItem
              label="Pixel Brush 4"
              thumbnail="/brushes/brush-preview-0.png"
              onClick={() => {
                changeBrush({
                  name: "Pixel Brush 4",
                  hardness: 1,
                  size: [4, 4],
                  spacing: 1,
                  texture: createSquarePixelBrushTexture(8),
                });
              }}
            />
            <BrushItem
              label="Pixel Spray Brush 40"
              thumbnail="/brushes/brush-preview-1.png"
              onClick={() => {
                changeBrush({
                  name: "Pixel Spray Brush 40",
                  hardness: 1,
                  size: [40, 40],
                  spacing: 10,
                  texture: createSprayBrushTexture(40, 40, 0.1),
                });
              }}
            />
            <BrushItem
              label="Pixel Grain Brush 100"
              thumbnail="/brushes/brush-preview-2.png"
              onClick={() => {
                changeBrush({
                  name: "Pixel Grain Brush 100",
                  hardness: 1,
                  size: [100, 100],
                  spacing: 10,
                  texture: createGrainBrushTexture(100, 100, 0.1),
                });
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function BrushItem({
  selected,
  className,
  brush,
  thumbnail,
  label,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
  label: string;
  thumbnail: string;
  brush?: BitmapEditorBrush;
}) {
  return (
    <div
      {...props}
      data-selected={selected}
      className={cn(
        "w-full rounded-sm hover:bg-accent px-4 py-2 data-[selected='true']:bg-accent",
        className
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="w-full h-16 mt-2">
        <img className="w-full h-full" src={thumbnail} alt={label} />
      </div>
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
