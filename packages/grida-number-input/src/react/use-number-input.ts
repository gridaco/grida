import { useState, useEffect, useCallback, useRef } from "react";
import type { NumberChange } from "../types";
import n from "../n";

// Local type definitions (duplicated to avoid external dependencies)
type TMixed<T, MIXED = "mixed"> = T | MIXED;

type UseNumberInputProps<MIXED = "mixed"> = {
  /** Type of number input - 'integer' for whole numbers, 'number' for decimals */
  type?: "integer" | "number";
  /** The current value of the input. Can be a number, empty string, or mixed value */
  value?: TMixed<number | "", MIXED>;
  /** Step size for increment/decrement operations */
  step?: number;
  /** Maximum precision tolerance to prevent floating point precision issues (default: 1) */
  precision?: number;
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
 * - Preserves natural precision when step allows it (0.9 stays 0.9 with step=1)
 * - Removes unnecessary trailing zeros (5.00 -> 5, 5.10 -> 5.1)
 * - Maintains proper precision based on step value only when necessary
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
 * - **Precision Loss**: Conditionally rounds values only when step precision requires it to avoid unnecessary precision loss
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
  precision = 1,
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
      : n.formatValueWithSuffix(
          (value as number | "") ?? "",
          suffix,
          scale,
          step,
          type,
          precision
        )
  );
  const lastCommittedRef = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocusedRef = useRef<boolean>(false);

  // Sync internal state with external value
  useEffect(() => {
    setInternalValue(
      mixed
        ? "mixed"
        : n.formatValueWithSuffix(
            (value as number | "") ?? "",
            suffix,
            scale,
            step,
            type,
            precision
          )
    );
    if (typeof value === "number" && !mixed) {
      const rounded = n.roundToStep(value, step, type, precision);
      const clamped = Math.min(
        Math.max(rounded, min ?? -Infinity),
        max ?? Infinity
      );
      lastCommittedRef.current = clamped;
    } else {
      lastCommittedRef.current = undefined;
    }
  }, [value, mixed, suffix, scale, step, type, precision, min, max]);

  const handleCommit = useCallback(
    (newValue: number) => {
      // Round based on type: integer type always rounds, number type preserves precision when possible
      const roundedValue = n.roundToStep(newValue, step, type, precision);
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
    [step, type, precision, min, max, mode, onValueCommit]
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
        const currentValue = n.parseValueWithScaling(
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
              n.formatValueWithSuffix(
                currentValue,
                suffix,
                scale,
                step,
                type,
                precision
              )
            );
          } else {
            setInternalValue(
              n.formatValueWithSuffix(
                (value as number | "") ?? "",
                suffix,
                scale,
                step,
                type,
                precision
              )
            );
          }
        } else {
          setInternalValue(
            n.formatValueWithSuffix(
              (value as number | "") ?? "",
              suffix,
              scale,
              step,
              type,
              precision
            )
          );
        }
      } else {
        setInternalValue(
          mixed
            ? "mixed"
            : n.formatValueWithSuffix(
                (value as number | "") ?? "",
                suffix,
                scale,
                step,
                type,
                precision
              )
        );
      }
      onBlur?.(e);
    },
    [
      commitOnBlur,
      mixed,
      value,
      suffix,
      scale,
      step,
      type,
      precision,
      safeCommit,
    ]
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
        const currentValue = n.parseValueWithScaling(
          String(internalValue),
          type,
          suffix,
          scale
        );
        if (isNaN(currentValue)) return;

        const delta =
          e.key === "ArrowUp" ? step * multiplier : -step * multiplier;
        const newValue = n.roundToStep(
          currentValue + delta,
          step,
          type,
          precision
        );
        const clampedValue =
          e.key === "ArrowUp"
            ? Math.min(newValue, max ?? Infinity)
            : Math.max(newValue, min ?? -Infinity);

        if (clampedValue !== currentValue) {
          setInternalValue(
            n.formatValueWithSuffix(
              clampedValue,
              suffix,
              scale,
              step,
              type,
              precision
            )
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
        const currentValue = n.parseValueWithScaling(
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
      precision,
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

      // For inputs with suffix, show raw user input until commit
      // This prevents the "1%2" issue when typing "12" in a percentage input
      if (suffix) {
        setInternalValue(txt);
      } else {
        // For inputs without suffix, parse and show the value
        const value = n.parseValueWithScaling(txt, type, suffix, scale);
        setInternalValue(txt);
      }

      // Always parse the value for callbacks, even if we don't display it
      const value = n.parseValueWithScaling(txt, type, suffix, scale);

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
    [type, mode, onValueChange, suffix, scale, precision]
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

      const currentValue = n.parseValueWithScaling(
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
  }, [
    commitOnBlur,
    mixed,
    internalValue,
    type,
    suffix,
    scale,
    precision,
    safeCommit,
  ]);

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
