import type * as React from "react";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import {
  hexToRgb,
  rgbToHex,
  normalizeChannelValue,
  normalizeRgbValue,
  parseFuzzyHex,
  type RGB,
  type RGBUnit,
} from "../color";

type UseHexValueInputOptions = {
  value: RGB;
  unit?: RGBUnit;
  fuzz?: boolean;
  onValueChange?: (hex: string) => void;
  onValueCommit?: (rgb: RGB, opacity?: number) => void;
};

const UNIT_STEPS: Record<RGBUnit, { fine: number; coarse: number }> = {
  u8: { fine: 1, coarse: 10 },
  f32: { fine: 0.01, coarse: 0.1 },
};

const getStep = (unit: RGBUnit, useCoarse: boolean) =>
  UNIT_STEPS[unit][useCoarse ? "coarse" : "fine"];

// Helper to check if two RGB values are equal
const areRgbEqual = (a: RGB, b: RGB): boolean =>
  a.r === b.r && a.g === b.g && a.b === b.b;

/**
 * Custom hook for managing hex color input with RGB value manipulation.
 *
 * This hook provides a comprehensive solution for hex color inputs that need:
 * - Ephemeral string state that allows any input while typing
 * - Arrow key navigation for individual color channels
 * - Smart selection handling for channel-specific editing
 * - Unit-aware ranges for `u8` (0-255) and `f32` (0-1) channel values
 * - Automatic value clamping and validation on commit
 *
 * ## Features
 * - **Channel-specific editing**: Arrow keys modify only the selected color channel(s)
 * - **Smart selection**: Automatically selects the appropriate hex digits based on cursor position
 * - **Value clamping**: Ensures color values stay within valid ranges for the selected unit
 * - **Unit support**: Works with RGB color objects expressed in either `u8` or `f32` units
 * - **Ephemeral state**: Allows any character input while typing, validates only on blur/Enter
 * - **Keyboard shortcuts**: Shift + arrow keys for larger increments (10 instead of 1)
 *
 * ## Channel Selection Logic
 * - **Red channel**: Cursor positions 0-1 (hex digits 1-2)
 * - **Green channel**: Cursor positions 2-3 (hex digits 3-4)
 * - **Blue channel**: Cursor positions 4-5 (hex digits 5-6)
 *
 * ## Usage Examples
 * ```tsx
 * // RGB color input with commit only
 * const rgbInput = useHexValueInput({
 *   value: { r: 255, g: 128, b: 64 },
 *   unit: "u8",
 *   onValueCommit: (color) => setColor(color)
 * });
 *
 * // RGB color input with ephemeral state tracking
 * const rgbInputWithEphemeral = useHexValueInput({
 *   value: { r: 255, g: 128, b: 64 },
 *   unit: "u8",
 *   onValueChange: (hex) => setEphemeralHex(hex), // raw hex string
 *   onValueCommit: (color) => setColor(color) // validated RGB
 * });
 *
 * return (
 *   <input
 *     {...rgbInput}
 *     placeholder="#FF8040"
 *   />
 * );
 * ```
 *
 * ## Keyboard Navigation
 * - **Arrow Up/Down**: Increment/decrement selected color channel(s)
 * - **Shift + Arrow Up/Down**: Increment/decrement by 10
 * - **Enter**: Commit if valid, revert if invalid, always blur
 * - **Focus**: Auto-selects all hex digits for easy replacement
 *
 * ## Value Constraints
 * - **RGB channels (`u8`)**: 0-255 (clamped automatically)
 * - **RGB channels (`f32`)**: 0-1 (clamped automatically)
 * - **Hex format**: 6 digits (RRGGBB)
 *
 * ## Commit Behavior
 * - **onValueChange**: Called on every keystroke with raw hex string (allows invalid values)
 * - **onValueCommit**: Called on blur/Enter with validated RGB and optional opacity (only if hex is valid)
 * - **Opacity handling**: When fuzzy parsing extracts alpha from RGBA formats (4 or 8 digits), it's passed as the second parameter
 * - **Blur/Enter**: If invalid hex, reverts to last valid value and blurs
 * - Enter key always blurs the input, similar to clicking outside
 *
 * @param options - Configuration options for the hex input
 * @param options.value - Initial RGB color value
 * @param options.unit - Color unit system (`u8` | `f32`)
 * @param options.fuzz - Enable fuzzy hex parsing (default: true, extracts and expands partial hex input)
 * @param options.onValueChange - Callback fired on every change with raw hex string
 * @param options.onValueCommit - Callback fired on blur/Enter with validated RGB and optional opacity (0-1)
 * @returns Object containing standard input props (ref, value, onChange, onKeyDown, onFocus, onBlur)
 */
export function useHexValueInput({
  value: initialValue,
  unit = "u8",
  fuzz = true,
  onValueChange,
  onValueCommit,
}: UseHexValueInputOptions) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState<RGB>(() =>
    normalizeRgbValue(initialValue, unit)
  );
  const [ephemeralHex, setEphemeralHex] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const lastValidHexRef = useRef<string>(
    rgbToHex(normalizeRgbValue(initialValue, unit), unit)
  );
  const onValueChangeRef = useRef(onValueChange);
  const onValueCommitRef = useRef(onValueCommit);

  // Keep refs in sync to avoid stale closures
  useEffect(() => {
    onValueChangeRef.current = onValueChange;
    onValueCommitRef.current = onValueCommit;
  }, [onValueChange, onValueCommit]);

  // Normalize the initial value and memoize based on actual values (not reference)
  // This prevents recalculation when the same color comes in as a new object reference
  const normalizedInitialValue = useMemo(() => {
    return normalizeRgbValue(initialValue, unit);
  }, [initialValue.r, initialValue.g, initialValue.b, unit]);

  // Update internal value only when initialValue actually changes (ignoring reference equality)
  // Skip update if currently focused to preserve user input while typing
  // Note: `value` is intentionally NOT in the dependency array - we only sync when external props change,
  // not when internal state changes (which would cause user commits to be immediately reverted)
  useEffect(() => {
    // Don't sync external changes when user is actively typing
    if (isFocused) return;

    // Use a ref to compare with current value to avoid including it in dependencies
    // This prevents the effect from running on internal state changes
    setValue((currentValue) => {
      // Only update if the external prop actually differs from current internal state
      if (!areRgbEqual(currentValue, normalizedInitialValue)) {
        const validHex = rgbToHex(normalizedInitialValue, unit);
        lastValidHexRef.current = validHex;
        setEphemeralHex(null);
        return normalizedInitialValue;
      }
      return currentValue;
    });
  }, [normalizedInitialValue, unit, isFocused]);

  const commitHex = useCallback(
    (hex: string) => {
      // If fuzz is enabled, try fuzzy parsing first
      let processedHex = hex;
      let extractedOpacity: number | undefined = undefined;
      if (fuzz) {
        const fuzzyResult = parseFuzzyHex(hex);
        if (fuzzyResult) {
          // Use the RRGGBB value from fuzzy parsing result
          processedHex = fuzzyResult.RRGGBB;
          // Extract opacity if present in the input (from RGBA or RRGGBBAA formats)
          if (fuzzyResult.alpha !== undefined) {
            extractedOpacity = fuzzyResult.alpha;
          }
        }
      }

      const parsedValue = hexToRgb(processedHex, unit);
      if (parsedValue) {
        const normalized = normalizeRgbValue(parsedValue, unit);
        setValue(normalized);
        setEphemeralHex(null);
        const validHex = rgbToHex(normalized, unit);
        lastValidHexRef.current = validHex;
        // Pass both RGB and extracted opacity (if present) to the commit callback
        onValueCommitRef.current?.(normalized, extractedOpacity);
        return true;
      }
      return false;
    },
    [fuzz, unit]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Handle Enter key: commit if valid, revert if invalid, always blur
      if (e.key === "Enter") {
        e.preventDefault();
        // Blur will trigger handleBlur which handles commit/revert logic
        // This ensures consistent behavior between Enter and blur events
        inputRef.current?.blur();
        return;
      }

      const selectionStart = inputRef.current?.selectionStart ?? 0;
      const selectionEnd = inputRef.current?.selectionEnd ?? 0;
      const direction =
        e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;

      if (!direction) return;

      const affectedChannels: Array<keyof RGB> = [];
      if (selectionStart < 2 && selectionEnd > 0) affectedChannels.push("r");
      if (selectionStart < 4 && selectionEnd > 2) affectedChannels.push("g");
      if (selectionStart < 6 && selectionEnd > 4) affectedChannels.push("b");

      if (!affectedChannels.length) return;

      e.preventDefault();

      const delta = getStep(unit, e.shiftKey) * direction;
      setValue((prevValue) => {
        const updatedValue = { ...prevValue };
        affectedChannels.forEach((key) => {
          updatedValue[key] = normalizeChannelValue(
            updatedValue[key] + delta,
            unit
          );
        });

        const normalized = normalizeRgbValue(updatedValue, unit);
        setEphemeralHex(null);
        const validHex = rgbToHex(normalized, unit);
        lastValidHexRef.current = validHex;
        onValueCommitRef.current?.(normalized);

        const start = Math.min(
          ...affectedChannels.map((key) =>
            key === "r" ? 0 : key === "g" ? 2 : 4
          )
        );
        const end = Math.max(
          ...affectedChannels.map((key) =>
            key === "r" ? 2 : key === "g" ? 4 : 6
          )
        );

        requestAnimationFrame(() => {
          if (inputRef.current) inputRef.current.setSelectionRange(start, end);
        });

        return normalized;
      });
    },
    [unit]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value.toUpperCase();
    // Remove '#' if present, store just the hex digits
    const cleanHex = hex.replace(/^#/, "");
    setEphemeralHex(cleanHex);
    // Optional callback for consumers who want to track ephemeral state
    onValueChangeRef.current?.(cleanHex);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    setEphemeralHex((currentEphemeralHex) => {
      const currentHex = currentEphemeralHex ?? lastValidHexRef.current;
      if (currentHex && currentHex.trim().length > 0) {
        const success = commitHex(currentHex);
        if (!success) {
          // Invalid hex, revert to last valid
          return null;
        }
      }
      // Empty or whitespace only, or successful commit - clear ephemeral
      return null;
    });
  }, [commitHex]);

  // Memoize the current valid hex to avoid recalculating on every render
  const currentValidHex = useMemo(() => rgbToHex(value, unit), [value, unit]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    // Initialize ephemeral hex to current valid hex if not already set
    // This ensures we start with a valid value for editing
    setEphemeralHex((currentEphemeralHex) => {
      const hexToUse = currentEphemeralHex ?? currentValidHex;
      // Use requestAnimationFrame to ensure state is updated before selection
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(0, hexToUse.length);
        }
      });
      return hexToUse;
    });
  }, [currentValidHex]);

  // Display ephemeral hex when focused, otherwise computed hex from RGB
  // When focused, always show ephemeral hex (allows free-form editing)
  // When not focused, show computed hex from the committed RGB value
  const displayValue = useMemo(
    () => (isFocused ? (ephemeralHex ?? currentValidHex) : currentValidHex),
    [isFocused, ephemeralHex, currentValidHex]
  );

  return {
    ref: inputRef,
    value: displayValue,
    onKeyDown: handleKeyDown,
    onChange: handleChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
  };
}
