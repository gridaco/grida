import * as React from "react";

/**
 * Hook for handling slider value with snapping and step constraints.
 *
 * This hook provides a universal solution for slider components that need:
 * - Value snapping to predefined marks
 * - Step-based value constraints
 * - Controlled/uncontrolled value management
 * - Proper value clamping within min/max bounds
 *
 * @param options - Configuration options for the slider
 * @param options.min - Minimum allowed value
 * @param options.max - Maximum allowed value
 * @param options.step - Step increment (optional). If provided, values will be rounded to nearest step
 * @param options.marks - Array of mark points for snapping (optional). Values will snap to nearest mark within threshold
 * @param options.defaultValue - Initial/default value (optional). Falls back to min if not provided
 * @param options.value - Controlled value (optional). If provided, overrides defaultValue
 * @param options.onValueChange - Callback fired when value changes during dragging
 * @param options.onValueCommit - Callback fired when value is committed (drag ends)
 * @param options.snapThreshold - Distance threshold for snapping to marks (optional). Defaults to 5% of range
 *
 * @returns Object containing:
 * - value: Current value as array (for Radix UI compatibility)
 * - onValueChange: Handler for value changes
 * - onValueCommit: Handler for value commits
 *
 * @example
 * ```tsx
 * const sliderProps = useSliderValue({
 *   min: 0,
 *   max: 100,
 *   step: 5,
 *   marks: [0, 25, 50, 75, 100],
 *   defaultValue: 50,
 *   onValueChange: (value) => console.log('Changing:', value),
 *   onValueCommit: (value) => console.log('Committed:', value),
 * });
 *
 * return (
 *   <Slider
 *     min={0}
 *     max={100}
 *     value={sliderProps.value}
 *     onValueChange={sliderProps.onValueChange}
 *     onValueCommit={sliderProps.onValueCommit}
 *   />
 * );
 * ```
 */
export function useSliderValue({
  min,
  max,
  step,
  marks,
  defaultValue,
  value: initialValue,
  onValueChange,
  onValueCommit,
  snapThreshold,
}: {
  min: number;
  max: number;
  step?: number;
  marks?: number[];
  defaultValue?: number;
  value?: number;
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
  snapThreshold?: number;
}) {
  const [value, setValue] = React.useState(initialValue ?? defaultValue ?? min);

  const handleValueChange = React.useCallback(
    (newValue: number[]) => {
      const rawValue = newValue[0];
      const snappedValue = findClosestMark(
        rawValue,
        marks,
        min,
        max,
        snapThreshold
      );
      // Apply step constraint if step is provided
      const steppedValue = step
        ? Math.round(snappedValue / step) * step
        : snappedValue;
      const clampedValue = Math.max(min, Math.min(max, steppedValue));

      setValue(clampedValue);
      onValueChange?.(clampedValue);
    },
    [marks, min, max, snapThreshold, step, onValueChange]
  );

  const handleValueCommit = React.useCallback(
    (newValue: number[]) => {
      const rawValue = newValue[0];
      const snappedValue = findClosestMark(
        rawValue,
        marks,
        min,
        max,
        snapThreshold
      );
      // Apply step constraint if step is provided
      const steppedValue = step
        ? Math.round(snappedValue / step) * step
        : snappedValue;
      const clampedValue = Math.max(min, Math.min(max, steppedValue));

      setValue(clampedValue);
      onValueCommit?.(clampedValue);
    },
    [marks, min, max, snapThreshold, step, onValueCommit]
  );

  // Update internal value when prop changes
  React.useEffect(() => {
    if (initialValue !== undefined) {
      setValue(initialValue);
    }
  }, [initialValue]);

  return {
    value: [value],
    onValueChange: handleValueChange,
    onValueCommit: handleValueCommit,
  };
}

/**
 * Helper function to find the closest mark point within a threshold.
 *
 * @param currentValue - The current slider value
 * @param marks - Array of mark points to snap to
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param snapThreshold - Distance threshold for snapping (defaults to 5% of range)
 * @returns The closest mark value if within threshold, otherwise the original value
 */
function findClosestMark(
  currentValue: number,
  marks: number[] | undefined,
  min: number,
  max: number,
  snapThreshold?: number
): number {
  // If value is exactly at min or max, don't snap to marks
  if (currentValue === min || currentValue === max) {
    return currentValue;
  }

  if (!marks || marks.length === 0) return currentValue;

  let closestMark = marks[0];
  let minDistance = Math.abs(currentValue - closestMark);

  for (const mark of marks) {
    const distance = Math.abs(currentValue - mark);
    if (distance < minDistance) {
      minDistance = distance;
      closestMark = mark;
    }
  }

  // Only snap if we're close enough (within the specified threshold)
  const threshold = snapThreshold ?? (max - min) * 0.05; // Default to 5% of range
  const result = minDistance <= threshold ? closestMark : currentValue;

  return result;
}
