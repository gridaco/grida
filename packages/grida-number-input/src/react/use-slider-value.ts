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
 * @param options.step - Step increment (optional). If provided, values will be rounded to nearest step. Works correctly with decimal steps (e.g., 0.01)
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
 * // Integer step example
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
 * // Decimal step example (e.g., for opacity values)
 * const opacitySliderProps = useSliderValue({
 *   min: 0.1,
 *   max: 0.5,
 *   step: 0.01,
 *   defaultValue: 0.3,
 *   onValueChange: (value) => console.log('Opacity changing:', value),
 *   onValueCommit: (value) => console.log('Opacity committed:', value),
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
  disabled,
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
  disabled?: boolean;
}) {
  const [value, setValue] = React.useState(initialValue ?? defaultValue ?? min);

  const handleValueChange = React.useCallback(
    (newValue: number[]) => {
      if (disabled) return;

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
        ? applyStepConstraint(snappedValue, step, min)
        : snappedValue;
      const clampedValue = Math.max(min, Math.min(max, steppedValue));

      setValue(clampedValue);
      onValueChange?.(clampedValue);
    },
    [marks, min, max, snapThreshold, step, onValueChange, disabled]
  );

  const handleValueCommit = React.useCallback(
    (newValue: number[]) => {
      if (disabled) return;

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
        ? applyStepConstraint(snappedValue, step, min)
        : snappedValue;
      const clampedValue = Math.max(min, Math.min(max, steppedValue));

      setValue(clampedValue);
      onValueCommit?.(clampedValue);
    },
    [marks, min, max, snapThreshold, step, onValueCommit, disabled]
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
    isSnapped: marks?.includes(value) ?? false,
  };
}

/**
 * Helper function to apply step constraint to a value, handling decimal steps properly.
 *
 * @param value - The value to constrain
 * @param step - The step size
 * @param min - The minimum value (used as the base for step calculation)
 * @returns The value constrained to the nearest step
 */
function applyStepConstraint(value: number, step: number, min: number): number {
  // Calculate the number of steps from the minimum value
  const stepsFromMin = (value - min) / step;

  // Round to the nearest step
  const roundedSteps = Math.round(stepsFromMin);

  // Calculate the final value
  const result = min + roundedSteps * step;

  // Handle floating point precision issues by rounding to a reasonable number of decimal places
  const decimalPlaces = Math.max(0, -Math.floor(Math.log10(step)));
  return (
    Math.round(result * Math.pow(10, decimalPlaces)) /
    Math.pow(10, decimalPlaces)
  );
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
