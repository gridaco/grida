import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/lib/utils";
import { WorkbenchUI } from "@/components/workbench";
import type { TMixed } from "../controls/utils/types";
import type { editor } from "@/grida-canvas";
import grida from "@grida/schema";

// Helper function to handle floating point precision
const roundToStep = (value: number, step: number): number => {
  // Count decimal places in step
  const stepDecimals = step.toString().split(".")[1]?.length || 0;
  // Round to the same number of decimal places as step
  return Number(value.toFixed(stepDecimals));
};

type NumericPropertyControlProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "value" | "step"
> & {
  /** Type of number input - 'integer' for whole numbers, 'number' for decimals */
  type?: "integer" | "number";
  /** The current value of the input. Can be a number, empty string, or 'mixed' */
  value?: TMixed<number | "">;
  /** Step size for increment/decrement operations */
  step?: number;
  /** Whether to automatically select all text when the input is focused */
  autoSelect?: boolean;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
} & (
    | {
        /** Mode for handling value changes with delta support */
        mode?: "auto";
        /** Callback when value changes during typing or arrow key navigation */
        onValueChange?: (change: editor.api.NumberChange) => void;
        /** Callback when value is committed (Enter key or arrow keys) */
        onValueCommit?: (change: editor.api.NumberChange) => void;
      }
    | {
        /** Mode for handling direct value changes */
        mode?: "fixed";
        /** Callback when value changes during typing or arrow key navigation */
        onValueChange?: (value: number) => void;
        /** Callback when value is committed (Enter key or arrow keys) */
        onValueCommit?: (value: number) => void;
      }
  );

/**
 * A specialized number input component with advanced features for precise numeric control.
 *
 * Key Features:
 * - Supports both integer and decimal number inputs
 * - Arrow key increment/decrement with step size control
 * - Shift + Arrow for 10x step size
 * - Auto-selection of text on focus
 * - Min/max value constraints
 * - Two operation modes:
 *   - "auto": Reports changes as deltas (e.g., {type: "delta", value: 1})
 *   - "fixed": Reports changes as absolute values (e.g., 101)
 * - Value commit on Enter or arrow keys
 * - ESC to cancel and blur
 * - Reset to initial value on blur
 * - Mixed value state support
 * - Floating point precision handling
 *
 * Detailed Behavior:
 *
 * 1. Value Changes & Commit:
 *    - Typing: Updates internal state without commit
 *    - Arrow keys: Updates and commits in one operation
 *    - Enter: Commits current value and blurs
 *    - ESC: Cancels changes and blurs
 *    - Blur without commit: Resets to initial value
 *
 * 2. Arrow Key Behavior:
 *    - Works on current input value, not just committed value
 *    - Example: Type "100" → Arrow Up → "101" (committed)
 *    - Shift + Arrow multiplies step by 10
 *    - Respects min/max constraints
 *    - Works identically in both "auto" and "fixed" modes
 *
 * 3. Value Commit Triggers:
 *    - Enter key (commits and blurs)
 *    - Arrow Up/Down keys (commits)
 *    - Blur (if value was changed)
 *
 * 4. Mode Differences:
 *    - "auto": Reports changes as deltas (useful for relative adjustments)
 *      Example: {type: "delta", value: 1} for increment
 *    - "fixed": Reports changes as absolute values
 *      Example: 101 for increment from 100
 *    - Both modes have identical UI behavior
 *
 * 5. Special States:
 *    - "mixed": Shows "mixed" text when multiple values are selected
 *    - Empty: Shows empty string when no value is set
 *    - Invalid: Resets to last valid value on blur
 *
 * Usage:
 * ```tsx
 * // Auto mode (delta-based changes)
 * <InputPropertyNumber
 *   value={100}
 *   step={0.1}
 *   min={0}
 *   max={1000}
 *   mode="auto"
 *   onValueChange={(change) => console.log('Value changing:', change)}
 *   onValueCommit={(change) => console.log('Value committed:', change)}
 * />
 *
 * // Fixed mode (absolute values)
 * <InputPropertyNumber
 *   value={100}
 *   step={0.1}
 *   min={0}
 *   max={1000}
 *   mode="fixed"
 *   onValueChange={(value) => console.log('Value changing:', value)}
 *   onValueCommit={(value) => console.log('Value committed:', value)}
 * />
 * ```
 */
export default function InputPropertyNumber({
  type = "number",
  placeholder,
  value,
  className,
  onKeyDown,
  mode = "auto",
  onValueChange,
  onValueCommit,
  step = 1,
  autoSelect = true,
  min,
  max,
  appearance,
  ...props
}: NumericPropertyControlProps & {
  appearance?: "none";
}) {
  const mixed = value === grida.mixed;
  const [internalValue, setInternalValue] = useState<string | number>(
    mixed ? "mixed" : (value ?? "")
  );

  // Sync internal state with external value
  useEffect(() => {
    setInternalValue(mixed ? "mixed" : (value ?? ""));
  }, [value, mixed]);

  const handleCommit = (newValue: number) => {
    const roundedValue = roundToStep(newValue, step);
    const clampedValue = Math.min(
      Math.max(roundedValue, min ?? -Infinity),
      max ?? Infinity
    );

    switch (mode) {
      case "auto":
        (onValueCommit as (change: editor.api.NumberChange) => void)?.({
          type: "set",
          value: clampedValue,
        });
        break;
      case "fixed":
        (onValueCommit as (change: number) => void)?.(clampedValue);
        break;
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (autoSelect && !mixed) {
      requestAnimationFrame(() => {
        e.target.select();
      });
    }
    props.onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Reset to initial value on blur
    setInternalValue(mixed ? "mixed" : (value ?? ""));
    props.onBlur?.(e);
  };

  return (
    <Input
      {...props}
      type={mixed ? "text" : "number"}
      placeholder={placeholder}
      className={cn(
        WorkbenchUI.inputVariants({ size: "xs" }),
        appearance === "none"
          ? "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          : "",
        className
      )}
      value={internalValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        onKeyDown?.(e);

        if (e.defaultPrevented) return;

        if (e.key === "Escape") {
          e.currentTarget.blur();
          e.preventDefault();
          return;
        }

        const multiplier = e.shiftKey ? 10 : 1;

        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          const currentValue =
            typeof internalValue === "number"
              ? internalValue
              : type === "integer"
                ? parseInt(internalValue as string)
                : parseFloat(internalValue as string);
          if (isNaN(currentValue)) return;

          const delta =
            e.key === "ArrowUp" ? step * multiplier : -step * multiplier;
          const newValue = roundToStep(currentValue + delta, step);
          const clampedValue =
            e.key === "ArrowUp"
              ? Math.min(newValue, max ?? Infinity)
              : Math.max(newValue, min ?? -Infinity);

          if (clampedValue !== currentValue) {
            setInternalValue(clampedValue);
            switch (mode) {
              case "auto":
                (onValueChange as (change: editor.api.NumberChange) => void)?.({
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

        switch (mode) {
          case "auto":
            if (e.key === "Enter") {
              const currentValue =
                typeof internalValue === "number"
                  ? internalValue
                  : type === "integer"
                    ? parseInt(internalValue as string)
                    : parseFloat(internalValue as string);
              if (!isNaN(currentValue)) {
                handleCommit(currentValue);
              }
              e.currentTarget.blur();
              e.preventDefault();
            }
            break;
          case "fixed":
            if (e.key === "Enter") {
              const currentValue =
                typeof internalValue === "number"
                  ? internalValue
                  : type === "integer"
                    ? parseInt(internalValue as string)
                    : parseFloat(internalValue as string);
              if (!isNaN(currentValue)) {
                handleCommit(currentValue);
              }
              e.currentTarget.blur();
              e.preventDefault();
            }
            break;
        }
      }}
      onChange={(e) => {
        const txt = e.target.value;
        const value = type === "integer" ? parseInt(txt) : parseFloat(txt) || 0;
        setInternalValue(txt);

        switch (mode) {
          case "auto":
            (onValueChange as (change: editor.api.NumberChange) => void)?.({
              type: "set",
              value,
            });
            break;
          case "fixed":
            (onValueChange as (change: number) => void)?.(value);
            break;
        }
      }}
    />
  );
}
