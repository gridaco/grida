import React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/lib/utils";
import { WorkbenchUI } from "@/components/workbench";
import type { TMixed } from "../controls/utils/types";
import type { editor } from "@/grida-canvas";
import { useNumberInput } from "./use-number-input";

type PercentagePropertyControlProps = Omit<
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
 * A specialized percentage input component with advanced features for precise numeric control.
 *
 * This component is identical to InputPropertyNumber but automatically appends a "%" suffix
 * to all displayed values. The underlying value is in decimal format (0.01 = 1%, 1.0 = 100%),
 * but the UI shows it as a percentage with the "%" symbol.
 *
 * Key Features:
 * - Supports both integer and decimal percentage inputs
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
 * - Automatic "%" suffix display
 *
 * Detailed Behavior:
 *
 * 1. Value Changes & Commit:
 *    - Typing: Updates internal state without commit
 *    - Arrow keys: Updates and commits in one operation
 *    - Enter: Commits current value and blurs
 *    - ESC: Cancels changes and blur
 *    - Blur: Commits by default (reverts if commitOnBlur is false)
 *
 * 2. Arrow Key Behavior:
 *    - Works on current input value, not just committed value
 *    - Example: Type "100" → Arrow Up → "101%" (committed)
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
 * 6. Percentage Display:
 *    - All values are displayed with "%" suffix
 *    - The underlying value is in decimal format (0.01 = 1%, 1.0 = 100%)
 *    - Parsing automatically removes "%" and converts to decimal when processing input
 *
 * Usage:
 * ```tsx
 * // Auto mode (delta-based changes)
 * <InputPropertyPercentage
 *   value={0.5}  // 50%
 *   step={0.001} // 0.1%
 *   min={0}
 *   max={1}      // 100%
 *   mode="auto"
 *   onValueChange={(change) => console.log('Value changing:', change)}
 *   onValueCommit={(change) => console.log('Value committed:', change)}
 * />
 *
 * // Fixed mode (absolute values)
 * <InputPropertyPercentage
 *   value={0.75} // 75%
 *   step={0.01}  // 1%
 *   min={0}
 *   max={1}      // 100%
 *   mode="fixed"
 *   onValueChange={(value) => console.log('Value changing:', value)}
 *   onValueCommit={(value) => console.log('Value committed:', value)}
 * />
 * ```
 */
export default function InputPropertyPercentage({
  type = "number",
  placeholder,
  value,
  className,
  onKeyDown,
  mode = "auto",
  onValueChange,
  onValueCommit,
  step = 0.01,
  autoSelect = true,
  min,
  max,
  commitOnBlur = true,
  appearance,
  ...props
}: PercentagePropertyControlProps & {
  appearance?: "none";
}) {
  const {
    internalValue,
    inputType,
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleChange,
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
    suffix: "%",
    scale: 100,
  });

  return (
    <Input
      {...props}
      type={inputType}
      placeholder={placeholder}
      className={cn(
        WorkbenchUI.inputVariants({ size: "xs" }),
        appearance === "none"
          ? "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          : "",
        className
      )}
      value={internalValue}
      onFocus={(e) => handleFocus(e, props.onFocus)}
      onBlur={(e) => handleBlur(e, props.onBlur)}
      onKeyDown={(e) => handleKeyDown(e, onKeyDown)}
      onChange={handleChange}
    />
  );
}
