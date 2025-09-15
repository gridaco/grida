"use client";

/**
 * PropertySlider - A "fat" slider component designed for standalone property controls
 *
 * This component differs from the basic `slider.tsx` in several key ways:
 *
 * **Visual Design:**
 * - **Height**: Much taller track (h-2 vs h-1) for better touch targets and visual prominence
 * - **Thumb**: Larger thumb (size-4 vs size-3) for easier interaction
 * - **Marks**: Includes visual mark indicators for important values (min, max, default)
 * - **Visual States**: Enhanced styling with mark states and snapping indicators
 *
 * **Usage Context:**
 * - **Standalone**: Designed to be the primary control for property values
 * - **Property Panels**: Optimized for side control panels where space allows for larger UI
 * - **Direct Manipulation**: Users interact primarily through the slider itself
 *
 * **vs Basic Slider (`slider.tsx`):**
 * - **Basic Slider**: Compact (h-1, size-3) designed to complement number inputs
 * - **Basic Slider**: Used alongside text inputs in tight layouts
 * - **Basic Slider**: Minimal visual footprint for secondary/additional controls
 * - **PropertySlider**: Rich, standalone control with enhanced UX features
 *
 * **Features:**
 * - Mark indicators for min/max/default values
 * - Smart snapping to mark values
 * - Enhanced visual feedback
 * - Optimized for touch and mouse interaction
 * - Built-in value management with `useSliderValue` hook
 */

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/components/lib/utils";
import { useSliderValue } from "@grida/number-input/react";

interface PropertySliderProps {
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

export function PropertySlider({
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
}: PropertySliderProps) {
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
        // Let Radix UI handle step constraint, we apply additional logic in useSliderValue
        step={step}
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
