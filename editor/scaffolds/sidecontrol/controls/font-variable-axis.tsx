"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/components/lib/utils";
import { useSliderValue } from "@grida/number-input/react";

interface FontVariableAxisSliderProps {
  min: number;
  max: number;
  step: number;
  marks?: number[];
  defaultValue?: number;
  value?: number;
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
  className?: string;
  snapThreshold?: number; // Customizable threshold (defaults to 5% of range)
  disabled?: boolean;
}

// Mark component for mark points and default value

function Mark({
  position,
  size = "sm",
  className,
  markIndex,
  markState,
}: {
  position: number;
  size?: "sm" | "md";
  className?: string;
  markIndex?: number;
  markState?: "min" | "max" | "def" | null;
}) {
  return (
    <div
      className={cn(
        "absolute top-1/2 rounded-full -translate-y-1/2 -translate-x-1/2 shadow-sm",
        "w-1 h-1",
        "data-[size=md]:w-1.5 data-[size=md]:h-1.5",
        "bg-primary-foreground/50 border border-ring/50",
        "data-[mark-state=def]:bg-primary-foreground/80 data-[mark-state=def]:border-ring/80",
        className
      )}
      style={{ left: `${position}%` }}
      data-mark-index={markIndex}
      data-mark-state={markState}
      data-size={size}
    />
  );
}

export function FontVariableAxisSlider({
  min,
  max,
  step,
  marks,
  defaultValue,
  value,
  onValueChange,
  onValueCommit,
  className,
  snapThreshold,
  disabled,
}: FontVariableAxisSliderProps) {
  const sliderProps = useSliderValue({
    min,
    max,
    step,
    marks,
    defaultValue,
    value,
    onValueChange,
    onValueCommit,
    snapThreshold,
    disabled,
  });

  // Calculate positions for mark dots
  const markPositions = React.useMemo(() => {
    if (!marks) return [];
    return marks.map((mark) => {
      const position = ((mark - min) / (max - min)) * 100;
      return { value: mark, position: Math.max(0, Math.min(100, position)) };
    });
  }, [marks, min, max]);

  // Calculate thumb mark state
  const currentValue = sliderProps.value[0];
  const matchingMark = marks?.find((mark) => mark === currentValue);
  let thumbMarkState: "min" | "max" | "def" | null = null;

  if (matchingMark !== undefined) {
    if (matchingMark === min) thumbMarkState = "min";
    else if (matchingMark === max) thumbMarkState = "max";
    else if (matchingMark === defaultValue) thumbMarkState = "def";
  }

  return (
    <div className={cn("relative", className)}>
      {/* Slider */}
      <SliderPrimitive.Root
        className={cn(
          "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
          className
        )}
        min={min}
        max={max}
        value={sliderProps.value}
        onValueChange={sliderProps.onValueChange}
        onValueCommit={sliderProps.onValueCommit}
        // Disable step to allow smooth dragging, we handle snapping ourselves
        step={undefined}
        disabled={disabled}
      >
        <SliderPrimitive.Track className="bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:w-full">
          <SliderPrimitive.Range className="bg-primary absolute data-[orientation=horizontal]:h-full" />

          {/* Mark dots */}
          <div className="absolute inset-0 pointer-events-none">
            {markPositions.map((mark, index) => {
              // Determine mark state
              let markState: "min" | "max" | "def" | null = null;
              if (mark.value === min) markState = "min";
              else if (mark.value === max) markState = "max";
              else if (mark.value === defaultValue) markState = "def";

              return (
                <Mark
                  key={`mark-${index}`}
                  position={mark.position}
                  markIndex={index}
                  markState={markState}
                />
              );
            })}
          </div>
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="block size-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 relative z-[999]"
          data-snapped={sliderProps.isSnapped}
          data-mark-state={thumbMarkState}
        />
      </SliderPrimitive.Root>
    </div>
  );
}
