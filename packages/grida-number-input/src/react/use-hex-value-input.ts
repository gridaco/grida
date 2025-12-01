import type * as React from "react";
import { useRef, useState, useEffect } from "react";
import {
  hexToRgb,
  rgbToHex,
  normalizeChannelValue,
  normalizeRgbValue,
  type RGB,
  type RGBUnit,
} from "../color";

type UseHexValueInputOptions = {
  value: RGB;
  unit?: RGBUnit;
  onValueChange?: (color: RGB) => void;
};

const UNIT_STEPS: Record<RGBUnit, { fine: number; coarse: number }> = {
  u8: { fine: 1, coarse: 10 },
  f32: { fine: 0.01, coarse: 0.1 },
};

const getStep = (unit: RGBUnit, useCoarse: boolean) =>
  UNIT_STEPS[unit][useCoarse ? "coarse" : "fine"];

/**
 * Custom hook for managing hex color input with RGB value manipulation.
 *
 * This hook provides a comprehensive solution for hex color inputs that need:
 * - Real-time hex to RGB conversion
 * - Arrow key navigation for individual color channels
 * - Smart selection handling for channel-specific editing
 * - Unit-aware ranges for `u8` (0-255) and `f32` (0-1) channel values
 * - Automatic value clamping and validation
 *
 * ## Features
 * - **Channel-specific editing**: Arrow keys modify only the selected color channel(s)
 * - **Smart selection**: Automatically selects the appropriate hex digits based on cursor position
 * - **Value clamping**: Ensures color values stay within valid ranges for the selected unit
 * - **Unit support**: Works with RGB color objects expressed in either `u8` or `f32` units
 * - **Real-time conversion**: Converts between hex strings and RGB objects
 * - **Keyboard shortcuts**: Shift + arrow keys for larger increments (10 instead of 1)
 *
 * ## Channel Selection Logic
 * - **Red channel**: Cursor positions 0-1 (hex digits 1-2)
 * - **Green channel**: Cursor positions 2-3 (hex digits 3-4)
 * - **Blue channel**: Cursor positions 4-5 (hex digits 5-6)
 *
 * ## Usage Examples
 * ```tsx
 * // RGB color input
 * const rgbInput = useHexValueInput({
 *   value: { r: 255, g: 128, b: 64 },
 *   unit: "u8",
 *   onValueChange: (color) => setColor(color)
 * });
 *
 * // f32 color input
 * const f32Input = useHexValueInput({
 *   value: { r: 1, g: 0.5, b: 0.25 },
 *   unit: "f32",
 *   onValueChange: (color) => setColor(color)
 * });
 *
 * return (
 *   <input
 *     ref={rgbInput.inputRef}
 *     value={rgbInput.hex}
 *     onChange={rgbInput.handleChange}
 *     onKeyDown={rgbInput.handleKeyDown}
 *     onFocus={rgbInput.handleFocus}
 *     placeholder="#FF8040"
 *   />
 * );
 * ```
 *
 * ## Keyboard Navigation
 * - **Arrow Up/Down**: Increment/decrement selected color channel(s)
 * - **Shift + Arrow Up/Down**: Increment/decrement by 10
 * - **Focus**: Auto-selects all hex digits for easy replacement
 *
 * ## Value Constraints
 * - **RGB channels (`u8`)**: 0-255 (clamped automatically)
 * - **RGB channels (`f32`)**: 0-1 (clamped automatically)
 * - **Hex format**: 6 digits (RRGGBB)
 *
 * @param options - Configuration options for the hex input
 * @param options.value - Initial RGB color value
 * @param options.unit - Color unit system (`u8` | `f32`)
 * @param options.onValueChange - Callback fired when color value changes
 * @returns Object containing input ref, hex string, and event handlers
 */
export function useHexValueInput({
  value: initialValue,
  unit = "u8",
  onValueChange,
}: UseHexValueInputOptions) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState<RGB>(() =>
    normalizeRgbValue(initialValue, unit)
  );

  useEffect(() => {
    setValue(normalizeRgbValue(initialValue, unit));
  }, [initialValue, unit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const selectionStart = inputRef.current?.selectionStart ?? 0;
    const selectionEnd = inputRef.current?.selectionEnd ?? 0;
    const direction = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;

    if (!direction) return;

    const affectedChannels: Array<keyof RGB> = [];
    if (selectionStart < 2 && selectionEnd > 0) affectedChannels.push("r");
    if (selectionStart < 4 && selectionEnd > 2) affectedChannels.push("g");
    if (selectionStart < 6 && selectionEnd > 4) affectedChannels.push("b");

    if (!affectedChannels.length) return;

    e.preventDefault();

    const delta = getStep(unit, e.shiftKey) * direction;
    const updatedValue = { ...value };
    affectedChannels.forEach((key) => {
      updatedValue[key] = normalizeChannelValue(
        updatedValue[key] + delta,
        unit
      );
    });

    setValue(updatedValue);
    onValueChange?.(updatedValue);

    const start = Math.min(
      ...affectedChannels.map((key) => (key === "r" ? 0 : key === "g" ? 2 : 4))
    );
    const end = Math.max(
      ...affectedChannels.map((key) => (key === "r" ? 2 : key === "g" ? 4 : 6))
    );

    requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.setSelectionRange(start, end);
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value.toUpperCase();
    const parsedValue = hexToRgb(hex, unit);
    if (parsedValue) {
      setValue(parsedValue);
      onValueChange?.(parsedValue);
    }
  };

  const handleFocus = () => {
    if (inputRef.current) {
      const hexValue = rgbToHex(value, unit);
      inputRef.current.setSelectionRange(0, hexValue.length);
    }
  };

  return {
    inputRef,
    hex: rgbToHex(value, unit),
    handleKeyDown,
    handleChange,
    handleFocus,
  };
}
