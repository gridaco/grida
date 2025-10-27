/**
 * @fileoverview
 * @module flex-align
 *
 * Flex Alignment Control Component
 *
 * This component provides a unified, interactive UI for selecting flex layout alignment properties.
 * It combines both main-axis (justify-content) and cross-axis (align-items) alignment controls
 * into a single, intuitive 3x3 grid interface.
 *
 * ## Features
 * - **Unified Interface**: Single UI component for selecting both main and cross axis alignment
 * - **3x3 Grid Layout**: Visual representation of 9 possible alignment combinations
 * - **Smart Spacing Handling**: When spacing properties (space-between, space-around, space-evenly)
 *   are set externally, the UI adapts to show only 3 relevant alignment options
 * - **Interactive Selection**: Users can easily select alignment combinations with visual feedback
 *
 * ## Alignment Combinations
 * The component supports all 9 combinations of flex alignment:
 * - **Main Axis**: start, center, end, space-between, space-around, space-evenly
 * - **Cross Axis**: start, center, end, stretch
 *
 * ## Usage Context
 * This component is used in the side control panel for flex containers, providing a more
 * intuitive alternative to separate main-axis and cross-axis alignment controls.
 *
 * ## Related Components
 * - `MainAxisAlignmentControl`: Handles main axis alignment (justify-content)
 * - `CrossAxisAlignmentControl`: Handles cross axis alignment (align-items)
 *
 * ## Visual Design
 * The component displays a 3x3 grid where:
 * - Each cell represents a combination of main and cross axis alignment
 * - Selected combinations are highlighted
 * - The grid adapts based on external spacing properties
 * - Icons and visual indicators help users understand the alignment behavior
 *
 * @see {@link ./main-axis-alignment.tsx} - Main axis alignment control
 * @see {@link ./cross-axis-alignment.tsx} - Cross axis alignment control
 */

import React from "react";
import { cn } from "@/components/lib/utils";
import type cg from "@grida/cg";
import grida from "@grida/schema";

type MainAxisAlignment = cg.MainAxisAlignment;
type CrossAxisAlignment = cg.CrossAxisAlignment;
type Axis = cg.Axis;

interface AlignmentCellIconProps {
  direction: Axis;
  mainAxisAlignment: MainAxisAlignment;
  crossAxisAlignment: CrossAxisAlignment;
  className?: string;
}

/**
 * AlignmentCellIcon - Flexbox icon representing flex alignment
 *
 * Renders 3 bars with varying sizes to represent flex alignment:
 * - Main axis alignment controls bar distribution (justifyContent: start/center/end)
 * - Cross axis alignment controls bar positioning (alignItems: start/center/end)
 * - Direction determines if bars are horizontal or vertical
 * - For horizontal: bars are vertical (1px wide), distributed left-right, aligned top/center/bottom
 * - For vertical: bars are horizontal (1px tall), distributed top-bottom, aligned left/center/right
 */
export function AlignmentCellIcon({
  direction,
  mainAxisAlignment,
  crossAxisAlignment,
  className,
}: AlignmentCellIconProps) {
  const isHorizontal = direction === "horizontal";

  const barWidth = 2;
  const barLengths = [10, 14, 7]; // Varying sizes for visual distinction
  const flexDirection = isHorizontal ? "row" : "column";

  return (
    <div
      className={cn("size-4 flex gap-0.5", className)}
      style={{
        flexDirection,
        justifyContent: mainAxisAlignment,
        alignItems: crossAxisAlignment,
      }}
    >
      {barLengths.map((length, index) => (
        <div
          key={index}
          className="bg-current rounded-sm"
          style={{
            width: isHorizontal ? `${barWidth}px` : `${length}px`,
            height: isHorizontal ? `${length}px` : `${barWidth}px`,
            flex: "0 0 auto",
          }}
        />
      ))}
    </div>
  );
}

type TMixed<T> = typeof grida.mixed | T;

interface FlexAlignValue {
  mainAxisAlignment: MainAxisAlignment;
  crossAxisAlignment: CrossAxisAlignment;
}

interface FlexAlignControlProps {
  direction?: Axis;
  value?: TMixed<FlexAlignValue>;
  onValueChange?: (value: FlexAlignValue) => void;
  className?: string;
}

// Pre-defined grid orders for each direction
// Key format: "mainAxis-crossAxis"
const GRID_ORDERS = {
  horizontal: {
    // Horizontal: rows=cross-axis, columns=main-axis
    "start-start": 0,
    "center-start": 1,
    "end-start": 2,
    "start-center": 3,
    "center-center": 4,
    "end-center": 5,
    "start-end": 6,
    "center-end": 7,
    "end-end": 8,
  },
  vertical: {
    // Vertical: rows=main-axis, columns=cross-axis
    "start-start": 0,
    "start-center": 1,
    "start-end": 2,
    "center-start": 3,
    "center-center": 4,
    "center-end": 5,
    "end-start": 6,
    "end-center": 7,
    "end-end": 8,
  },
} as const;

/**
 * FlexAlignControl - 3x3 grid interface for selecting flex alignment
 *
 * Provides a unified interface for selecting both main-axis and cross-axis alignment
 * through a visual 3x3 grid where each cell represents a combination of alignments.
 */
export function FlexAlignControl({
  direction = "horizontal",
  value,
  onValueChange,
  className,
}: FlexAlignControlProps) {
  const isMixed = value === grida.mixed;
  const hasValue = value && value !== grida.mixed;

  const mainAxisAlignment = hasValue ? value.mainAxisAlignment : undefined;
  const crossAxisAlignment = hasValue ? value.crossAxisAlignment : undefined;
  const isHorizontal = direction === "horizontal";

  // Define the 3x3 grid combinations
  const mainAxisOptions: MainAxisAlignment[] = ["start", "center", "end"];
  const crossAxisOptions: CrossAxisAlignment[] = ["start", "center", "end"];

  const handleCellClick = (
    mainAxis: MainAxisAlignment,
    crossAxis: CrossAxisAlignment
  ) => {
    onValueChange?.({
      mainAxisAlignment: mainAxis,
      crossAxisAlignment: crossAxis,
    });
  };

  const isSelected = (
    mainAxis: MainAxisAlignment,
    crossAxis: CrossAxisAlignment
  ) => {
    if (!hasValue) return false;
    return mainAxisAlignment === mainAxis && crossAxisAlignment === crossAxis;
  };

  const getGridOrder = (
    mainAxis: MainAxisAlignment,
    crossAxis: CrossAxisAlignment
  ) => {
    const key =
      `${mainAxis}-${crossAxis}` as keyof typeof GRID_ORDERS.horizontal;
    return GRID_ORDERS[direction][key];
  };

  return (
    <div
      className={cn(
        "grid grid-cols-3 grid-rows-3 px-0.5 py-1 aspect-video min-h-15 rounded-md border border-input bg-transparent dark:bg-input/30 shadow-xs",
        className
      )}
    >
      {mainAxisOptions.flatMap((mainAxis) =>
        crossAxisOptions.map((crossAxis) => {
          const selected = isSelected(mainAxis, crossAxis);

          return (
            <button
              key={`${mainAxis}-${crossAxis}`}
              onClick={() => handleCellClick(mainAxis, crossAxis)}
              data-focused={selected}
              className={cn(
                "group/flex-align-cell flex items-center justify-center transition-colors",
                "focus:outline-none"
              )}
              style={{ order: getGridOrder(mainAxis, crossAxis) }}
              title={`${mainAxis} (main) × ${crossAxis} (cross)`}
            >
              {/* Selected state - always visible when selected */}
              {selected && (
                <AlignmentCellIcon
                  direction={direction}
                  crossAxisAlignment={crossAxis}
                  mainAxisAlignment={mainAxis}
                  className="w-4 h-4 text-sky-500"
                />
              )}

              {/* Non-selected state - dot by default, icon on hover */}
              {!selected && (
                <div className="relative flex items-center justify-center w-4 h-4">
                  {/* Default dot - hidden on group hover */}
                  <div className="size-0.5 bg-muted-foreground rounded-full group-hover/flex-align-cell:opacity-0 transition-opacity pointer-events-none" />

                  {/* Hover preview icon - shown on group hover */}
                  <AlignmentCellIcon
                    direction={direction}
                    crossAxisAlignment={crossAxis}
                    mainAxisAlignment={mainAxis}
                    className="w-4 h-4 text-muted-foreground opacity-0 group-hover/flex-align-cell:opacity-100 transition-opacity absolute inset-0 m-auto pointer-events-none"
                  />
                </div>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
