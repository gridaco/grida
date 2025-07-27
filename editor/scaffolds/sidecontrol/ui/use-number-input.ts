import { useState, useEffect, useCallback } from "react";
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

// Helper function to format value with proper precision based on step
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

// Helper function to parse value with suffix
const parseValueWithSuffix = (
  value: string,
  type: "integer" | "number",
  suffix?: string
): number => {
  if (!value) return 0;

  // Remove suffix if present
  let cleanValue = value;
  if (suffix && value.endsWith(suffix)) {
    cleanValue = value.slice(0, -suffix.length);
  }

  // Parse the numeric value
  return type === "integer"
    ? parseInt(cleanValue)
    : parseFloat(cleanValue) || 0;
};

// Helper function to format value with suffix and precision
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

// Helper function to parse value with scaling
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

type UseNumberInputProps = {
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
  /** Mode for handling value changes */
  mode?: "auto" | "fixed";
  /** Callback when value changes during typing or arrow key navigation */
  onValueChange?:
    | ((change: editor.api.NumberChange) => void)
    | ((value: number) => void);
  /** Callback when value is committed (Enter key or arrow keys) */
  onValueCommit?:
    | ((change: editor.api.NumberChange) => void)
    | ((value: number) => void);
  /** Optional suffix to append to the displayed value (e.g., "%", "px") */
  suffix?: string;
  /** Optional scale factor for display (e.g., 100 for percentages: 0.01 -> 1%) */
  scale?: number;
};

/**
 * Custom hook for managing number input state and behavior.
 *
 * Extracts all the logic from InputPropertyNumber component while maintaining
 * all the original behavior including:
 * - Internal state management
 * - Value synchronization
 * - Arrow key handling
 * - Value commit logic
 * - Focus/blur behavior
 * - Mixed value support
 * - Min/max constraints
 * - Step precision handling with smart formatting
 * - Suffix support for formatting and parsing
 * - Value scaling for display (e.g., percentages: 0.01 -> 1%)
 *
 * Smart Formatting:
 * - Respects step precision (step=1 shows integers, step=0.1 shows 1 decimal)
 * - Removes unnecessary trailing zeros (5.00 -> 5, 5.10 -> 5.1)
 * - Maintains proper precision based on step value
 */
export function useNumberInput({
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
}: UseNumberInputProps) {
  const mixed = value === grida.mixed;
  const [internalValue, setInternalValue] = useState<string | number>(
    mixed ? "mixed" : formatValueWithSuffix(value ?? "", suffix, scale, step)
  );

  // Sync internal state with external value
  useEffect(() => {
    setInternalValue(
      mixed ? "mixed" : formatValueWithSuffix(value ?? "", suffix, scale, step)
    );
  }, [value, mixed, suffix, scale, step]);

  const handleCommit = useCallback(
    (newValue: number) => {
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
    },
    [step, min, max, mode, onValueCommit]
  );

  const handleFocus = useCallback(
    (
      e: React.FocusEvent<HTMLInputElement>,
      onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void
    ) => {
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
      // Reset to initial value on blur
      setInternalValue(
        mixed
          ? "mixed"
          : formatValueWithSuffix(value ?? "", suffix, scale, step)
      );
      onBlur?.(e);
    },
    [mixed, value, suffix, scale, step]
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
            const currentValue = parseValueWithScaling(
              String(internalValue),
              type,
              suffix,
              scale
            );
            if (!isNaN(currentValue)) {
              handleCommit(currentValue);
            }
            e.currentTarget.blur();
            e.preventDefault();
          }
          break;
        case "fixed":
          if (e.key === "Enter") {
            const currentValue = parseValueWithScaling(
              String(internalValue),
              type,
              suffix,
              scale
            );
            if (!isNaN(currentValue)) {
              handleCommit(currentValue);
            }
            e.currentTarget.blur();
            e.preventDefault();
          }
          break;
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
          (onValueChange as (change: editor.api.NumberChange) => void)?.({
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

  return {
    // State
    internalValue,
    mixed,

    // Event handlers
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleChange,

    // Computed values
    inputType: mixed ? "text" : suffix ? "text" : "number",
  };
}
