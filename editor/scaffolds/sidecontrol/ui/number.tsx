import React from "react";
import { cn } from "@/components/lib/utils";
import { WorkbenchUI } from "@/components/workbench";
import type { TMixed } from "../controls/utils/types";
import type { editor } from "@/grida-canvas";
import { useNumberInput } from "./use-number-input";

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
  /** Optional icon to display in the input */
  icon?: React.ReactNode;
  /** Whether to commit the value when input loses focus */
  commitOnBlur?: boolean;
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
 * - Value commit on Enter, blur, or arrow keys
 * - ESC to cancel and blur
 * - Blur commit can be disabled
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
 *    - Blur: Commits by default (reverts if commitOnBlur is false)
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
 *    - Blur (if enabled)
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
  onKeyDown,
  mode = "auto",
  onValueChange,
  onValueCommit,
  step = 1,
  autoSelect = true,
  min,
  max,
  commitOnBlur = true,
  appearance = "none",
  icon,
  className,
  ...props
}: NumericPropertyControlProps & {
  appearance?: "none";
}) {
  const {
    internalValue,
    inputType,
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleChange,
    inputRef,
  } = useNumberInput({
    type,
    value,
    step,
    autoSelect,
    min,
    max,
    mode,
    onValueChange,
    onValueCommit,
    commitOnBlur,
  });

  // Track focus state for data-focus attribute
  const [isFocused, setIsFocused] = React.useState(false);

  // Handle container click to focus the input
  const handleContainerClick = React.useCallback(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  // Handle container pointer down to focus the input
  const handleContainerPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only handle if clicking on the container itself, not on the input or icon
      if (e.target === e.currentTarget) {
        inputRef.current?.focus();
      }
    },
    [inputRef]
  );

  // Custom focus handler to track focus state
  const handleInputFocus = React.useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      handleFocus(e, props.onFocus);
    },
    [handleFocus, props.onFocus]
  );

  // Custom blur handler to track focus state
  const handleInputBlur = React.useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      handleBlur(e, props.onBlur);
    },
    [handleBlur, props.onBlur]
  );

  return (
    <div
      className={cn(
        WorkbenchUI.inputVariants({ size: "xs" }),
        "flex items-center gap-2 cursor-text",
        className
      )}
      data-focus={isFocused}
      onClick={handleContainerClick}
      onPointerDown={handleContainerPointerDown}
      tabIndex={-1} // Make container focusable for accessibility
    >
      {icon && (
        <div className="flex-shrink-0 text-muted-foreground">{icon}</div>
      )}
      <div className="flex-1 min-w-0">
        <input
          {...props}
          ref={inputRef}
          type={inputType}
          placeholder={placeholder}
          className={cn(
            WorkbenchUI.rawInputVariants({ size: "xs" }),
            appearance === "none"
              ? "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              : ""
          )}
          value={internalValue}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={(e) => handleKeyDown(e, onKeyDown)}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
