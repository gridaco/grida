import { useCallback, useRef } from "react";
import { useDrag, type UserDragConfig } from "@use-gesture/react";
import type { NumberChange } from "../types";

type UseNumberGestureProps<MODE extends "auto" | "fixed" = "auto"> = {
  /** Initial value for the gesture (required for "fixed" mode, optional for "auto" mode) */
  value?: MODE extends "fixed" ? number : number | undefined;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Step size for value increments */
  step?: number;
  /** Mode for handling value changes */
  mode?: MODE;
  /** Callback when value changes during dragging */
  onValueChange?: MODE extends "auto"
    ? (change: NumberChange) => void
    : (value: number) => void;
  /** Callback when value is committed (drag ends) */
  onValueCommit?: MODE extends "auto"
    ? (change: NumberChange) => void
    : (value: number) => void;
  /** Threshold for drag movement before gesture starts (default: 0.5) */
  threshold?: number;
  /** Sensitivity multiplier for drag movement (default: 0.01) - lower values = less sensitive */
  sensitivity?: number;
  /** Whether to constrain values to min/max bounds */
  clamp?: boolean;
  /** Axis constraint for the gesture itself (default: undefined - allows all directions) */
  axisForGesture?: "x" | "y";
  /** Axis constraint for value calculation (default: undefined - uses dominant direction) */
  axisForValue?: "x" | "y";
  /** Whether the gesture is disabled (default: false) */
  disabled?: boolean;
};

/**
 * Custom hook for creating virtual slider gestures using @use-gesture/react.
 *
 * This hook provides a comprehensive solution for virtual sliders that need:
 * - Drag-based value manipulation
 * - Configurable sensitivity and constraints
 * - Support for both fixed and delta value modes
 * - Min/max value clamping
 * - Step-based value increments
 * - Real-time value updates during dragging
 *
 * ## Virtual Slider Concept
 * Think of this as a "virtual slider" - you can turn any UI element into a draggable
 * value controller. Unlike traditional sliders that have a visual track, this creates
 * an invisible drag area that responds to mouse/touch movement with configurable
 * sensitivity and constraints.
 *
 * ## Features
 * - **Virtual Slider**: Can be applied to any UI element (labels, icons, divs, etc.)
 * - **Dual Axis Control**: Separate gesture axis and value axis for optimal UX
 * - **Conditional Disable**: Built-in disabled state to avoid conditional hook issues
 * - **Drag Threshold**: Configurable threshold for drag movement before gesture starts
 * - **Sensitivity Control**: Configurable sensitivity multiplier for fine-tuned control
 * - **Value Constraints**: Automatic clamping within min/max bounds
 * - **Step Precision**: Rounds values to nearest step increment
 * - **Mode Support**: Both "auto" (delta) and "fixed" (absolute) value modes
 * - **Real-time Updates**: Immediate value changes during drag with commit on release
 *
 * ## Usage Examples
 * ```tsx
 * // Basic virtual slider with default sensitivity (0.1)
 * const gesture = useNumberGesture({
 *   value: 50,
 *   min: 0,
 *   max: 100,
 *   step: 1,
 *   onValueChange: (value) => console.log('Changing:', value),
 *   onValueCommit: (value) => setValue(value)
 * });
 *
 * // Auto mode - no initial value needed, works with deltas
 * const autoGesture = useNumberGesture({
 *   mode: "auto",
 *   sensitivity: 0.01,
 *   step: 1,
 *   onValueChange: (change) => {
 *     if (change.type === "delta") {
 *       setValue(prev => prev + change.value);
 *     }
 *   }
 * });
 *
 * // Fixed mode - requires initial value
 * const fixedGesture = useNumberGesture({
 *   mode: "fixed",
 *   value: 50,
 *   sensitivity: 0.01,
 *   step: 1,
 *   onValueCommit: (value) => setValue(value)
 * });
 *
 * // Horizontal-only drag (gesture and value both locked to x-axis)
 * const horizontalGesture = useNumberGesture({
 *   axisForGesture: "x",
 *   axisForValue: "x",
 *   sensitivity: 0.01,
 *   onValueChange: (change) => {
 *     if (change.type === "delta") {
 *       setValue(prev => prev + change.value);
 *     }
 *   }
 * });
 *
 * // Allow all gesture directions, but only use horizontal movement for values
 * const horizontalValueGesture = useNumberGesture({
 *   axisForGesture: undefined, // Allow all directions
 *   axisForValue: "x", // Only use horizontal movement for values
 *   sensitivity: 0.01,
 *   onValueChange: (change) => {
 *     if (change.type === "delta") {
 *       setValue(prev => prev + change.value);
 *     }
 *   }
 * });
 *
 * // Conditionally disabled gesture (avoids conditional hook issues)
 * const conditionalGesture = useNumberGesture({
 *   disabled: !isEditable, // Disable when not editable
 *   sensitivity: 0.01,
 *   onValueChange: (change) => {
 *     if (change.type === "delta") {
 *       setValue(prev => prev + change.value);
 *     }
 *   }
 * });
 *
 * return (
 *   <div
 *     {...gesture.bind()}
 *     className="virtual-slider"
 *   >
 *     Drag me to change value
 *   </div>
 * );
 * ```
 *
 * ## Gesture Behavior
 * - **Dual Axis Control**: Separate control for gesture detection and value calculation
 * - **Gesture Axis**: Controls which directions trigger the drag gesture (prevents unwanted triggers)
 * - **Value Axis**: Controls which movement direction affects the value (filters movement)
 * - **Movement Calculation**: Uses dominant direction when value axis is undefined
 * - **Threshold**: Configurable threshold for drag movement before gesture starts (default: 0.5)
 * - **Sensitivity**: Configurable multiplier for drag-to-value ratio (default: 0.01)
 * - **Constraints**: Values automatically clamped to min/max bounds
 * - **Step Precision**: Values rounded to nearest step increment
 * - **Commit**: Value committed when drag ends
 *
 * @param props - Configuration options for the number gesture
 * @returns Object containing gesture bindings and utilities
 */
export function useNumberGesture<MODE extends "auto" | "fixed" = "auto">({
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  mode = "auto" as MODE,
  onValueChange,
  onValueCommit,
  threshold = 0.5,
  sensitivity = 0.01,
  clamp = true,
  axisForGesture,
  axisForValue,
  disabled = false,
}: UseNumberGestureProps<MODE>) {
  const startValueRef = useRef<number>(value);
  const lastValueRef = useRef<number>(value);

  /**
   * Rounds a number to match the precision of the given step value.
   */
  const roundToStep = useCallback((value: number, step: number): number => {
    const stepDecimals = step.toString().split(".")[1]?.length || 0;
    return Number(value.toFixed(stepDecimals));
  }, []);

  /**
   * Clamps a value between min and max bounds.
   */
  const clampValue = useCallback(
    (value: number, min: number, max: number): number => {
      return Math.min(Math.max(value, min), max);
    },
    []
  );

  /**
   * Calculates the delta value based on drag movement.
   */
  const calculateDelta = useCallback(
    (deltaX: number, deltaY: number): number => {
      // Apply axis constraints for value calculation
      let delta: number;
      if (axisForValue === "x") {
        delta = deltaX; // Only horizontal movement
      } else if (axisForValue === "y") {
        delta = deltaY; // Only vertical movement
      } else {
        // Default: use the dominant movement direction
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        delta = absX > absY ? deltaX : deltaY;
      }

      // Apply sensitivity to the movement delta
      const scaledDelta = delta * sensitivity;

      // Apply step to the scaled movement delta
      const steppedDelta = roundToStep(scaledDelta, step);

      return steppedDelta;
    },
    [sensitivity, step, axisForValue, roundToStep]
  );

  /**
   * Handles value change callbacks based on mode.
   */
  const handleValueChange = useCallback(
    (newValue: number, delta: number) => {
      if (!onValueChange) return;

      if (mode === "auto") {
        (onValueChange as (change: NumberChange) => void)({
          type: "delta",
          value: delta,
        });
      } else {
        (onValueChange as (value: number) => void)(newValue);
      }
    },
    [mode, onValueChange]
  );

  /**
   * Handles value commit callbacks based on mode.
   */
  const handleValueCommit = useCallback(
    (newValue: number, delta: number) => {
      if (!onValueCommit) return;

      if (mode === "auto") {
        (onValueCommit as (change: NumberChange) => void)({
          type: "delta",
          value: delta,
        });
      } else {
        (onValueCommit as (value: number) => void)(newValue);
      }
    },
    [mode, onValueCommit]
  );

  const bind = useDrag(
    ({ first, last, movement: [mx, my], memo = [0, 0] }) => {
      if (first) {
        // Store the starting value when drag begins
        startValueRef.current = value;
        lastValueRef.current = value;
        return [mx, my];
      }

      // Calculate delta from movement
      const totalDelta = calculateDelta(mx, my);

      // Calculate incremental delta from last position
      const incrementalDelta = totalDelta - lastValueRef.current;

      // Only trigger change if incremental delta is significant
      if (Math.abs(incrementalDelta) > 0) {
        if (mode === "auto") {
          // In auto mode, pass the incremental delta
          handleValueChange(0, incrementalDelta);
        } else {
          // In fixed mode, calculate absolute value
          const newValue = startValueRef.current + totalDelta;
          const clampedValue = clamp
            ? clampValue(newValue, min, max)
            : newValue;
          handleValueChange(clampedValue, incrementalDelta);
        }
        lastValueRef.current = totalDelta;
      }

      if (last) {
        // Commit the final incremental delta when drag ends
        const finalTotalDelta = calculateDelta(mx, my);
        const finalIncrementalDelta = finalTotalDelta - lastValueRef.current;

        if (mode === "auto") {
          handleValueCommit(0, finalIncrementalDelta);
        } else {
          const finalValue = startValueRef.current + finalTotalDelta;
          const clampedValue = clamp
            ? clampValue(finalValue, min, max)
            : finalValue;
          handleValueCommit(clampedValue, finalIncrementalDelta);
        }
      }

      return [mx, my];
    },
    {
      // Configuration options for the drag gesture
      axis: axisForGesture, // Use the gesture axis constraint (undefined = allow all directions)
      filterTaps: false, // Don't filter out taps
      preventScroll: true, // Prevent page scrolling during drag
      pointer: { capture: false }, // Don't capture pointer events
      threshold, // Use the threshold option from useDrag
      enabled: !disabled, // Disable the gesture when true
    } satisfies UserDragConfig
  );

  return {
    /**
     * Gesture bindings to apply to any DOM element
     */
    bind,

    /**
     * Current calculated value based on the gesture
     */
    getCurrentValue: useCallback(() => {
      return lastValueRef.current;
    }, []),

    /**
     * Reset the gesture to initial state
     */
    reset: useCallback(() => {
      startValueRef.current = value;
      lastValueRef.current = value;
    }, [value]),
  };
}
