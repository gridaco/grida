import { useState, useEffect, useCallback, useRef } from "react";
import type { NumberChange } from "../types";

// Local type definitions (duplicated to avoid external dependencies)
type TMixed<T, MIXED = "mixed"> = T | MIXED;

/**
 * Rounds a number to match the precision of the given step value.
 *
 * @param value - The number to round
 * @param step - The step value to match precision with
 * @returns The rounded number with precision matching the step
 *
 * @example
 * roundToStep(1.234, 0.1) // Returns 1.2
 * roundToStep(1.234, 1)   // Returns 1
 * roundToStep(1.234, 0.01) // Returns 1.23
 */
const roundToStep = (value: number, step: number): number => {
  // Count decimal places in step
  const stepDecimals = step.toString().split(".")[1]?.length || 0;
  // Round to the same number of decimal places as step
  return Number(value.toFixed(stepDecimals));
};

/**
 * Formats a number with precision matching the step value and removes trailing zeros.
 *
 * @param value - The number to format
 * @param step - The step value to determine precision
 * @returns Formatted string with appropriate precision
 *
 * @example
 * formatValueWithPrecision(5.00, 1)   // Returns "5"
 * formatValueWithPrecision(5.10, 0.1) // Returns "5.1"
 * formatValueWithPrecision(5.12, 0.01) // Returns "5.12"
 */
const formatValueWithPrecision = (value: number, step: number): string => {
  // Count decimal places in step
  const stepDecimals = step.toString().split(".")[1]?.length || 0;

  if (stepDecimals === 0) {
    // Integer step - show as integer
    return Math.round(value).toString();
  }

  // Format with step precision
  const formatted = value.toFixed(stepDecimals);

  // Remove trailing zeros after decimal point
  return formatted.replace(/\.?0+$/, "");
};

/**
 * Parses a string value into a number, handling optional suffix removal.
 * Returns NaN for empty or invalid values instead of 0 to prevent unwanted commits.
 *
 * @param value - The string value to parse
 * @param type - Whether to parse as integer or number
 * @param suffix - Optional suffix to remove (e.g., "%", "px")
 * @returns Parsed number or NaN if invalid/empty
 *
 * @example
 * parseValueWithSuffix("123%", "number", "%") // Returns 123
 * parseValueWithSuffix("", "number")          // Returns NaN
 * parseValueWithSuffix("abc", "number")       // Returns NaN
 */
const parseValueWithSuffix = (
  value: string,
  type: "integer" | "number",
  suffix?: string
): number => {
  if (!value) return NaN;

  // Remove suffix if present
  let cleanValue = value;
  if (suffix && value.endsWith(suffix)) {
    cleanValue = value.slice(0, -suffix.length);
  }

  // Parse the numeric value
  const parsed =
    type === "integer" ? parseInt(cleanValue) : parseFloat(cleanValue);

  return isNaN(parsed) ? NaN : parsed;
};

/**
 * Formats a value for display with optional suffix, scaling, and precision.
 *
 * @param value - The value to format (number, string, or "mixed")
 * @param suffix - Optional suffix to append (e.g., "%", "px")
 * @param scale - Optional scale factor for display (e.g., 100 for percentages)
 * @param step - Optional step value to determine precision
 * @returns Formatted string for display
 *
 * @example
 * formatValueWithSuffix(0.5, "%", 100, 0.1) // Returns "50%"
 * formatValueWithSuffix("mixed")            // Returns "mixed"
 * formatValueWithSuffix("")                 // Returns ""
 */
const formatValueWithSuffix = (
  value: string | number,
  suffix?: string,
  scale?: number,
  step?: number
): string => {
  if (value === "mixed") return "mixed";
  if (value === "") return "";

  let numericValue =
    typeof value === "number" ? value : parseFloat(String(value));

  // Apply scaling if provided (e.g., for percentages: 0.01 -> 1)
  if (scale && typeof numericValue === "number") {
    numericValue = numericValue * scale;
  }

  // Format with proper precision based on step
  const formattedValue = step
    ? formatValueWithPrecision(numericValue, step)
    : String(numericValue);

  return suffix ? `${formattedValue}${suffix}` : formattedValue;
};

/**
 * Parses a string value into a number with optional suffix removal and inverse scaling.
 *
 * @param value - The string value to parse
 * @param type - Whether to parse as integer or number
 * @param suffix - Optional suffix to remove (e.g., "%", "px")
 * @param scale - Optional scale factor for inverse scaling (e.g., 100 for percentages)
 * @returns Parsed number with inverse scaling applied, or NaN if invalid
 *
 * @example
 * parseValueWithScaling("50%", "number", "%", 100) // Returns 0.5
 * parseValueWithScaling("123", "number", undefined, 100) // Returns 1.23
 */
const parseValueWithScaling = (
  value: string,
  type: "integer" | "number",
  suffix?: string,
  scale?: number
): number => {
  const parsedValue = parseValueWithSuffix(value, type, suffix);

  // Apply inverse scaling if provided (e.g., for percentages: 1 -> 0.01)
  if (scale && typeof parsedValue === "number") {
    return parsedValue / scale;
  }

  return parsedValue;
};

type UseNumberInputProps<MIXED = "mixed"> = {
  /** Type of number input - 'integer' for whole numbers, 'number' for decimals */
  type?: "integer" | "number";
  /** The current value of the input. Can be a number, empty string, or mixed value */
  value?: TMixed<number | "", MIXED>;
  /** Step size for increment/decrement operations */
  step?: number;
  /** Whether to automatically select all text when the input is focused */
  autoSelect?: boolean;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Mode for handling value changes */
  mode?: "auto" | "fixed";
  /** Callback when value changes during typing or arrow key navigation */
  onValueChange?: ((change: NumberChange) => void) | ((value: number) => void);
  /** Callback when value is committed (Enter key or arrow keys) */
  onValueCommit?: ((change: NumberChange) => void) | ((value: number) => void);
  /** Optional suffix to append to the displayed value (e.g., "%", "px") */
  suffix?: string;
  /** Optional scale factor for display (e.g., 100 for percentages: 0.01 -> 1%) */
  scale?: number;
  /** Whether to commit the value when input loses focus */
  commitOnBlur?: boolean;
  /** The mixed value symbol/identifier - can be any unique value like a symbol */
  mixed?: MIXED;
};

/**
 * Custom hook for managing number input state and behavior with comprehensive safety checks.
 *
 * ## Features
 * - **Internal state management**: Maintains internal value separate from external value
 * - **Value synchronization**: Syncs with external value changes while preserving user input
 * - **Arrow key handling**: Increment/decrement with step precision and min/max constraints
 * - **Safe commit logic**: Prevents unwanted commits with multiple safety checks
 * - **Focus/blur behavior**: Optional commit on blur with safety validation
 * - **Mixed value support**: Handles "mixed" state for multiple selected values
 * - **Min/max constraints**: Enforces value bounds with proper clamping
 * - **Step precision handling**: Smart formatting based on step value
 * - **Suffix support**: Handles display suffixes (%, px, etc.) with proper parsing
 * - **Value scaling**: Supports display scaling (e.g., percentages: 0.01 -> 1%)
 *
 * ## Safety Features
 * - **NaN Prevention**: Empty/invalid inputs return NaN instead of 0 to prevent unwanted commits
 * - **Focus Validation**: Only commits values when input is actually focused (unless forced)
 * - **Dirty State Check**: Only commits values that differ from the last committed value
 * - **Global Pointer Safety**: Handles cases where input is destroyed before blur
 *
 * ## Smart Formatting
 * - Respects step precision (step=1 shows integers, step=0.1 shows 1 decimal)
 * - Removes unnecessary trailing zeros (5.00 -> 5, 5.10 -> 5.1)
 * - Maintains proper precision based on step value
 *
 * ## Usage Examples
 * ```tsx
 * // Basic number input
 * const { internalValue, handleChange, handleKeyDown, handleFocus, handleBlur } = useNumberInput({
 *   value: 42,
 *   onValueCommit: (value) => console.log('Committed:', value)
 * });
 *
 * // Percentage input with scaling
 * const percentageInput = useNumberInput({
 *   value: 0.5,
 *   suffix: '%',
 *   scale: 100,
 *   step: 0.1,
 *   onValueCommit: (value) => setPercentage(value) // value will be 0.5, display shows 50%
 * });
 *
 * // Integer input with constraints
 * const ageInput = useNumberInput({
 *   type: 'integer',
 *   value: 25,
 *   min: 0,
 *   max: 120,
 *   step: 1
 * });
 *
 * // With custom mixed value (e.g., using a symbol)
 * const customMixedInput = useNumberInput<symbol>({
 *   value: someValue,
 *   mixed: Symbol('mixed') // or any unique identifier
 * });
 * ```
 *
 * ## Commit Scenarios
 * 1. **Blur Events**: Commits if value is dirty and valid (forceCommit=true)
 * 2. **Enter/Tab Keys**: Commits if value is valid (forceCommit=true)
 * 3. **Global Pointer Down**: Commits only if focused and dirty (no forceCommit)
 * 4. **Arrow Keys**: Commits immediately with delta changes
 *
 * ## Error Handling & Edge Cases
 * - **Empty Input**: Returns NaN instead of 0 to prevent unwanted commits
 * - **Invalid Input**: Returns NaN and skips commit to preserve existing value
 * - **Mixed Values**: Handles "mixed" state gracefully without committing
 * - **Focus Loss**: Safely handles cases where input is destroyed before blur
 * - **Value Constraints**: Automatically clamps values to min/max bounds
 * - **Precision Loss**: Rounds values to match step precision to avoid floating point errors
 * - **Suffix Parsing**: Safely handles malformed suffix inputs
 * - **Scaling Edge Cases**: Handles zero scale values and extreme scaling factors
 *
 * ## Performance Considerations
 * - Uses `useCallback` for all event handlers to prevent unnecessary re-renders
 * - Minimal re-renders through careful dependency management
 * - Efficient parsing with early returns for edge cases
 * - Global event listener cleanup to prevent memory leaks
 *
 * @param props - Configuration object for the number input
 * @param props.mixed - The mixed value symbol/identifier (defaults to "mixed")
 * @returns Object containing state, event handlers, and computed values
 */
export function useNumberInput<MIXED = "mixed">({
  type = "number",
  value,
  step = 1,
  autoSelect = true,
  min,
  max,
  mode = "auto",
  onValueChange,
  onValueCommit,
  suffix,
  scale,
  commitOnBlur = true,
  mixed: mixedValue = "mixed" as MIXED,
}: UseNumberInputProps<MIXED>) {
  const mixed = value === mixedValue;
  const [internalValue, setInternalValue] = useState<string | number>(
    mixed
      ? "mixed"
      : formatValueWithSuffix((value as number | "") ?? "", suffix, scale, step)
  );
  const lastCommittedRef = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocusedRef = useRef<boolean>(false);

  // Sync internal state with external value
  useEffect(() => {
    setInternalValue(
      mixed
        ? "mixed"
        : formatValueWithSuffix(
            (value as number | "") ?? "",
            suffix,
            scale,
            step
          )
    );
    if (typeof value === "number" && !mixed) {
      const rounded = roundToStep(value, step);
      const clamped = Math.min(
        Math.max(rounded, min ?? -Infinity),
        max ?? Infinity
      );
      lastCommittedRef.current = clamped;
    } else {
      lastCommittedRef.current = undefined;
    }
  }, [value, mixed, suffix, scale, step, min, max]);

  const handleCommit = useCallback(
    (newValue: number) => {
      const roundedValue = roundToStep(newValue, step);
      const clampedValue = Math.min(
        Math.max(roundedValue, min ?? -Infinity),
        max ?? Infinity
      );
      if (lastCommittedRef.current === clampedValue) return;
      lastCommittedRef.current = clampedValue;

      switch (mode) {
        case "auto":
          (onValueCommit as (change: NumberChange) => void)?.({
            type: "set",
            value: clampedValue,
          });
          break;
        case "fixed":
          (onValueCommit as (change: number) => void)?.(clampedValue);
          break;
      }
    },
    [step, min, max, mode, onValueCommit]
  );

  /**
   * Safe commit function that includes comprehensive safety checks for all commit scenarios.
   *
   * This function prevents unwanted commits by validating:
   * 1. Value validity (not NaN)
   * 2. Focus state (unless forced)
   * 3. Dirty state (value has actually changed)
   *
   * @param valueToCommit - The numeric value to commit
   * @param forceCommit - Whether to bypass focus check (used for blur/Enter events)
   * @returns true if commit was successful, false if skipped due to safety checks
   *
   * @example
   * // Normal commit (requires focus)
   * safeCommit(42) // Only commits if input is focused and value is dirty
   *
   * // Forced commit (bypasses focus check)
   * safeCommit(42, true) // Commits if value is dirty, regardless of focus
   */
  const safeCommit = useCallback(
    (valueToCommit: number, forceCommit: boolean = false) => {
      // Safety check 0: Don't commit NaN values (empty/invalid input)
      if (isNaN(valueToCommit)) return false;

      // Safety check 1: Only commit if the input is focused (unless forced)
      if (!forceCommit && !isFocusedRef.current) return false;

      // Safety check 2: Only commit if the value is "dirty" (different from last committed)
      const lastCommitted = lastCommittedRef.current;
      if (lastCommitted !== undefined && valueToCommit === lastCommitted)
        return false;

      handleCommit(valueToCommit);
      return true;
    },
    [handleCommit]
  );

  const handleFocus = useCallback(
    (
      e: React.FocusEvent<HTMLInputElement>,
      onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void
    ) => {
      isFocusedRef.current = true;
      if (autoSelect && !mixed) {
        requestAnimationFrame(() => {
          e.target.select();
        });
      }
      onFocus?.(e);
    },
    [autoSelect, mixed]
  );

  const handleBlur = useCallback(
    (
      e: React.FocusEvent<HTMLInputElement>,
      onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
    ) => {
      isFocusedRef.current = false;
      if (commitOnBlur && !mixed) {
        const currentValue = parseValueWithScaling(
          String(e.currentTarget.value),
          type,
          suffix,
          scale
        );
        if (!isNaN(currentValue)) {
          // Use safe commit with forceCommit=true for blur events
          const committed = safeCommit(currentValue, true);
          if (committed) {
            setInternalValue(
              formatValueWithSuffix(currentValue, suffix, scale, step)
            );
          } else {
            setInternalValue(
              formatValueWithSuffix(
                (value as number | "") ?? "",
                suffix,
                scale,
                step
              )
            );
          }
        } else {
          setInternalValue(
            formatValueWithSuffix(
              (value as number | "") ?? "",
              suffix,
              scale,
              step
            )
          );
        }
      } else {
        setInternalValue(
          mixed
            ? "mixed"
            : formatValueWithSuffix(
                (value as number | "") ?? "",
                suffix,
                scale,
                step
              )
        );
      }
      onBlur?.(e);
    },
    [commitOnBlur, mixed, value, suffix, scale, step, type, safeCommit]
  );

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
    ) => {
      onKeyDown?.(e);

      if (e.defaultPrevented) return;

      if (e.key === "Escape") {
        e.currentTarget.blur();
        e.preventDefault();
        return;
      }

      const multiplier = e.shiftKey ? 10 : 1;

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const currentValue = parseValueWithScaling(
          String(internalValue),
          type,
          suffix,
          scale
        );
        if (isNaN(currentValue)) return;

        const delta =
          e.key === "ArrowUp" ? step * multiplier : -step * multiplier;
        const newValue = roundToStep(currentValue + delta, step);
        const clampedValue =
          e.key === "ArrowUp"
            ? Math.min(newValue, max ?? Infinity)
            : Math.max(newValue, min ?? -Infinity);

        if (clampedValue !== currentValue) {
          setInternalValue(
            formatValueWithSuffix(clampedValue, suffix, scale, step)
          );
          switch (mode) {
            case "auto":
              (onValueChange as (change: NumberChange) => void)?.({
                type: "delta",
                value: delta,
              });
              break;
            case "fixed":
              (onValueChange as (change: number) => void)?.(clampedValue);
              break;
          }
          handleCommit(clampedValue);
        }
        e.preventDefault();
        return;
      }

      // Handle Enter/Tab keys for both modes (same logic)
      if (e.key === "Enter" || e.key === "Tab") {
        const currentValue = parseValueWithScaling(
          String(internalValue),
          type,
          suffix,
          scale
        );
        if (!isNaN(currentValue)) {
          // Use safe commit with forceCommit=true for Enter/Tab keys
          safeCommit(currentValue, true);
        }
        e.currentTarget.blur();
      }
    },
    [
      internalValue,
      type,
      step,
      max,
      min,
      mode,
      onValueChange,
      handleCommit,
      safeCommit,
      suffix,
      scale,
    ]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const txt = e.target.value;
      const value = parseValueWithScaling(txt, type, suffix, scale);
      setInternalValue(txt);

      switch (mode) {
        case "auto":
          (onValueChange as (change: NumberChange) => void)?.({
            type: "set",
            value,
          });
          break;
        case "fixed":
          (onValueChange as (change: number) => void)?.(value);
          break;
      }
    },
    [type, mode, onValueChange, suffix, scale]
  );

  // Global pointer down listener to commit pending changes when the input is
  // removed before blur can occur (e.g., selection change destroys the element).
  // Uses safe commit which includes safety checks for focus and dirty state.
  useEffect(() => {
    if (!commitOnBlur || mixed) return;

    const handlePointerDown = (e: PointerEvent) => {
      const el = inputRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;

      const currentValue = parseValueWithScaling(
        String(internalValue),
        type,
        suffix,
        scale
      );
      if (isNaN(currentValue)) return;

      // Use safe commit (no forceCommit for pointer down - relies on focus check)
      safeCommit(currentValue);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [commitOnBlur, mixed, internalValue, type, suffix, scale, safeCommit]);

  return {
    // State
    /** Current internal value (string or number) - may differ from external value during editing */
    internalValue,
    /** Whether the current value represents a "mixed" state (multiple selected values) */
    mixed,

    // Event handlers
    /** Focus event handler with optional auto-select behavior */
    handleFocus,
    /** Blur event handler with optional commit on blur and safety checks */
    handleBlur,
    /** Key down event handler supporting arrow keys, Enter, Tab, and Escape */
    handleKeyDown,
    /** Change event handler for input value changes during typing */
    handleChange,

    // Refs
    /** Ref to the input element for direct DOM access */
    inputRef,

    // Computed values
    /** Input type attribute - "text" for mixed/suffixed values, "number" for pure numbers */
    inputType: mixed ? "text" : suffix ? "text" : "number",
  };
}
