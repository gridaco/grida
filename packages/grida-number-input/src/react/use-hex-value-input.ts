import { useRef, useState, useEffect } from "react";
import type * as React from "react";
import { hexToRgb, rgbToHex, type RGB, type RGBA } from "../color";

/**
 * Custom hook for managing hex color input with RGB/RGBA value manipulation.
 *
 * This hook provides a comprehensive solution for hex color inputs that need:
 * - Real-time hex to RGB/RGBA conversion
 * - Arrow key navigation for individual color channels
 * - Smart selection handling for channel-specific editing
 * - Support for both RGB and RGBA color formats
 * - Automatic value clamping and validation
 *
 * ## Features
 * - **Channel-specific editing**: Arrow keys modify only the selected color channel(s)
 * - **Smart selection**: Automatically selects the appropriate hex digits based on cursor position
 * - **Value clamping**: Ensures color values stay within valid ranges (0-255 for RGB, 0-1 for alpha)
 * - **Format support**: Works with both RGB and RGBA color objects
 * - **Real-time conversion**: Converts between hex strings and RGB/RGBA objects
 * - **Keyboard shortcuts**: Shift + arrow keys for larger increments (10 instead of 1)
 *
 * ## Channel Selection Logic
 * - **Red channel**: Cursor positions 0-1 (hex digits 1-2)
 * - **Green channel**: Cursor positions 2-3 (hex digits 3-4)
 * - **Blue channel**: Cursor positions 4-5 (hex digits 5-6)
 * - **Alpha channel**: Cursor positions 6-7 (hex digits 7-8, RGBA only)
 *
 * ## Usage Examples
 * ```tsx
 * // RGB color input
 * const rgbInput = useHexValueInput<RGB>({
 *   value: { r: 255, g: 128, b: 64 },
 *   onValueChange: (color) => setColor(color)
 * });
 *
 * // RGBA color input
 * const rgbaInput = useHexValueInput<RGBA>({
 *   value: { r: 255, g: 128, b: 64, a: 0.8 },
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
 * - **RGB channels**: 0-255 (clamped automatically)
 * - **Alpha channel**: 0-1 (clamped automatically)
 * - **Hex format**: 6 digits for RGB, 8 digits for RGBA
 *
 * @param options - Configuration options for the hex input
 * @param options.value - Initial RGB or RGBA color value
 * @param options.onValueChange - Callback fired when color value changes
 * @returns Object containing input ref, hex string, and event handlers
 */
export function useHexValueInput<T extends RGB | RGBA>({
  value: initialValue,
  onValueChange,
}: {
  value: T;
  onValueChange?: (color: T) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const selectionStart = inputRef.current?.selectionStart || 0;
    const selectionEnd = inputRef.current?.selectionEnd || 0;
    const direction = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
    const step = e.shiftKey ? 10 : 1;

    if (!direction) return;
    e.preventDefault();

    const affectedChannels: Array<keyof T> = [];
    if (selectionStart < 2 && selectionEnd > 0) affectedChannels.push("r");
    if (selectionStart < 4 && selectionEnd > 2) affectedChannels.push("g");
    if (selectionStart < 6 && selectionEnd > 4) affectedChannels.push("b");
    if ("a" in value && selectionStart < 8 && selectionEnd > 6)
      affectedChannels.push("a" as keyof T);

    const updatedValue = { ...value };
    affectedChannels.forEach((key) => {
      const max = key === "a" ? 1 : 255;
      const min = 0;
      const currentValue = value[key] as number;
      const newValue = Math.min(
        max,
        Math.max(min, currentValue + step * direction)
      );
      (updatedValue as any)[key] = newValue;
    });

    setValue(updatedValue);
    onValueChange?.(updatedValue);

    const start = Math.min(
      ...affectedChannels.map((key) =>
        key === "r" ? 0 : key === "g" ? 2 : key === "b" ? 4 : 6
      )
    );
    const end = Math.max(
      ...affectedChannels.map((key) =>
        key === "r" ? 2 : key === "g" ? 4 : key === "b" ? 6 : 8
      )
    );

    requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.setSelectionRange(start, end);
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value.toUpperCase();
    const parsedValue = hexToRgb<T>(hex);
    if (parsedValue) {
      setValue(parsedValue);
      onValueChange?.(parsedValue);
    }
  };

  const handleFocus = () => {
    if (inputRef.current) {
      inputRef.current.setSelectionRange(0, rgbToHex(value).length);
    }
  };

  return {
    inputRef,
    hex: rgbToHex(value),
    handleKeyDown,
    handleChange,
    handleFocus,
  };
}
