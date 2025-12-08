import type { RGB, RGBA } from "./types";
export { type RGB, type RGBA };

export type RGBUnit = "u8" | "f32";

const CHANNEL_MAX: Record<RGBUnit, number> = {
  u8: 255,
  f32: 1,
};

export const normalizeChannelValue = (value: number, unit: RGBUnit) => {
  const clamped = Math.min(CHANNEL_MAX[unit], Math.max(0, value));
  return unit === "u8" ? Math.round(clamped) : Number(clamped.toFixed(4));
};

export const normalizeRgbValue = (color: RGB, unit: RGBUnit): RGB => ({
  r: normalizeChannelValue(color.r, unit),
  g: normalizeChannelValue(color.g, unit),
  b: normalizeChannelValue(color.b, unit),
});

const toHexChannel = (value: number, unit: RGBUnit) =>
  unit === "u8" ? value : Math.round(value * 255);

const fromHexChannel = (value: number, unit: RGBUnit) =>
  unit === "u8" ? value : Number((value / 255).toFixed(4));

const channelToHexString = (value: number) =>
  value.toString(16).padStart(2, "0");

/**
 * Converts an RGB color object to a hex string.
 *
 * @param color - RGB color object to convert
 * @param unit - Input color unit system (`u8` by default)
 * @returns Hex string in uppercase format (e.g., "FF8040")
 *
 * @example
 * rgbToHex({ r: 255, g: 128, b: 64 }, "u8") // Returns "FF8040"
 * rgbToHex({ r: 1, g: 0.5, b: 0.25 }, "f32") // Returns "FF8040"
 */
export const rgbToHex = (color: RGB, unit: RGBUnit = "u8"): string => {
  const normalized = normalizeRgbValue(color, unit);
  const r = channelToHexString(toHexChannel(normalized.r, unit));
  const g = channelToHexString(toHexChannel(normalized.g, unit));
  const b = channelToHexString(toHexChannel(normalized.b, unit));
  return `${r}${g}${b}`.toUpperCase();
};

/**
 * Converts a hex string to an RGB color object in the requested unit.
 *
 * @param hex - Hex string (6 digits for RGB)
 * @param unit - Desired output color unit system (`u8` by default)
 * @returns RGB color object, or null if hex string is invalid
 *
 * @example
 * hexToRgb("FF8040") // Returns { r: 255, g: 128, b: 64 }
 * hexToRgb("FF8040", "f32") // Returns { r: 1, g: 0.502, b: 0.251 }
 */
export const hexToRgb = (hex: string, unit: RGBUnit = "u8"): RGB | null => {
  if (!/^[0-9A-F]{6}$/i.test(hex)) return null;

  const normalizedHex = hex.toUpperCase();
  const r = parseInt(normalizedHex.slice(0, 2), 16);
  const g = parseInt(normalizedHex.slice(2, 4), 16);
  const b = parseInt(normalizedHex.slice(4, 6), 16);

  return {
    r: fromHexChannel(r, unit),
    g: fromHexChannel(g, unit),
    b: fromHexChannel(b, unit),
  };
};

/**
 * Result of fuzzy hex parsing
 */
export type FuzzyHexResult = {
  /** 6-digit hex color string in RRGGBB format */
  RRGGBB: string;
  /** Alpha/opacity value (0-1) if provided in input, undefined otherwise */
  alpha?: number;
};

/**
 * Extracts the first contiguous sequence of valid hex digits (0-9, A-F) from a string.
 *
 * This finds the first valid hex sequence and stops at the first non-hex character.
 *
 * @param input - Input string that may contain non-hex characters
 * @returns String containing the first valid hex digit sequence, or empty string if none found
 *
 * @example
 * extractHexDigits("1+1") // Returns "1" (first sequence)
 * extractHexDigits("abc123") // Returns "ABC123" (continuous sequence)
 * extractHexDigits("1+2+3") // Returns "1" (first sequence only)
 * extractHexDigits("xyz") // Returns ""
 */
export function extractHexDigits(input: string): string {
  const match = input.toUpperCase().match(/^[^0-9A-F]*([0-9A-F]+)/);
  return match ? match[1] : "";
}

/**
 * Expands a hex digit string to a valid 6-digit hex color following standard formats.
 *
 * Supported formats:
 * - 1 digit (U): "f" => "FFFFFF" (repeat 6 times)
 * - 2 digits (U): "ff" => "FFFFFF" (repeat 3 times)
 * - 3 digits (RGB): "fff" => "FFFFFF" (duplicate each digit: RGB => RRGGBB)
 * - 4 digits (RGBA): "fff0" => "FFFFFF" with alpha 0.0 (duplicate RGB, extract alpha)
 * - 5 digits: Use first 3 for RGB, ignore rest => "fff00" => "FFFFFF"
 * - 6 digits (RRGGBB): "ff8040" => "FF8040" (use as-is)
 * - 7 digits: Use first 6 for RGB => "ff80400" => "FF8040"
 * - 8 digits (RRGGBBAA): "ff8040ff" => "FF8040" with alpha 1.0
 *
 * @param hexDigits - String containing only hex digits (0-9, A-F)
 * @returns Structured result with RRGGBB and optional alpha, or null if input is empty
 *
 * @example
 * expandHexDigits("f") // Returns { RRGGBB: "FFFFFF" }
 * expandHexDigits("ff") // Returns { RRGGBB: "FFFFFF" }
 * expandHexDigits("fff") // Returns { RRGGBB: "FFFFFF" }
 * expandHexDigits("fff0") // Returns { RRGGBB: "FFFFFF", alpha: 0.0 }
 * expandHexDigits("ff8040") // Returns { RRGGBB: "FF8040" }
 * expandHexDigits("ff8040ff") // Returns { RRGGBB: "FF8040", alpha: 1.0 }
 */
export function expandHexDigits(hexDigits: string): FuzzyHexResult | null {
  const digits = hexDigits.toUpperCase();

  if (digits.length === 0) {
    return null;
  }

  if (digits.length === 1) {
    // Single digit (U): repeat 6 times to form RRGGBB
    // "f" => "FFFFFF"
    const RRGGBB = digits.repeat(6);
    return { RRGGBB };
  }

  if (digits.length === 2) {
    // Two digits (U): repeat 3 times to form RRGGBB
    // "ff" => "FFFFFF"
    const RRGGBB = digits.repeat(3);
    return { RRGGBB };
  }

  if (digits.length === 3) {
    // Three digits (RGB): duplicate each digit to form RRGGBB
    // "fff" => "FFFFFF" (F + F = FF, F + F = FF, F + F = FF)
    const RRGGBB = digits
      .split("")
      .map((d) => d + d)
      .join("");
    return { RRGGBB };
  }

  if (digits.length === 4) {
    // Four digits (RGBA): first 3 digits (RGB) duplicate to form RRGGBB, 4th digit is alpha
    // "fff0" => RRGGBB: "FFFFFF", alpha: 0.0
    const RGB = digits.slice(0, 3);
    const alphaHexDigit = digits.slice(3, 4);
    const RRGGBB = RGB.split("")
      .map((d) => d + d)
      .join("");
    // Convert single hex digit to 0-1 alpha: duplicate digit, parse as hex, divide by 255
    // "0" => "00" => 0 => 0.0
    // "F" => "FF" => 255 => 1.0
    const alpha = parseInt(alphaHexDigit + alphaHexDigit, 16) / 255;
    return { RRGGBB, alpha };
  }

  if (digits.length === 5) {
    // Five digits: use first 3 digits (RGB), duplicate each to form RRGGBB, ignore digits 4-5
    // "fff00" => "FFFFFF" (uses "fff" only)
    const RGB = digits.slice(0, 3);
    const RRGGBB = RGB.split("")
      .map((d) => d + d)
      .join("");
    return { RRGGBB };
  }

  if (digits.length === 6) {
    // Six digits (RRGGBB): use as-is
    // "ff8040" => "FF8040"
    const RRGGBB = digits;
    return { RRGGBB };
  }

  if (digits.length === 7) {
    // Seven digits: use first 6 digits as RRGGBB, ignore 7th digit
    // "ff80400" => "FF8040"
    const RRGGBB = digits.slice(0, 6);
    return { RRGGBB };
  }

  if (digits.length >= 8) {
    // Eight or more digits (RRGGBBAA): first 6 digits are RRGGBB, digits 7-8 are alpha
    // "ff8040ff" => RRGGBB: "FF8040", alpha: 1.0
    // Additional digits beyond 8 are ignored
    const RRGGBB = digits.slice(0, 6);
    const alphaHex = digits.slice(6, 8);
    const alpha = parseInt(alphaHex, 16) / 255;
    return { RRGGBB, alpha };
  }

  // Should never reach here, but TypeScript needs this
  return null;
}

/**
 * Parses a fuzzy hex input string into a valid 6-digit hex color with optional alpha.
 *
 * This function:
 * 1. Extracts only valid hex digits from the input (ignoring other characters)
 * 2. Expands the digits to a valid 6-digit hex string following standard color formats
 * 3. Extracts alpha/opacity if present in the input (4 or 8 digits)
 *
 * @param input - User input string that may contain non-hex characters or partial hex
 * @returns Structured result with RRGGBB and optional alpha, or null if no valid hex digits found
 *
 * @example
 * parseFuzzyHex("1") // Returns { RRGGBB: "111111" }
 * parseFuzzyHex("23") // Returns { RRGGBB: "232323" }
 * parseFuzzyHex("123") // Returns { RRGGBB: "112233" }
 * parseFuzzyHex("fff0") // Returns { RRGGBB: "FFFFFF", alpha: 0.0 }
 * parseFuzzyHex("1+1") // Returns { RRGGBB: "111111" } (extracts "1", expands to "111111")
 * parseFuzzyHex("abc") // Returns { RRGGBB: "AABBCC" }
 * parseFuzzyHex("ff8040ff") // Returns { RRGGBB: "FF8040", alpha: 1.0 }
 * parseFuzzyHex("xyz") // Returns null (no valid hex digits)
 */
export function parseFuzzyHex(input: string): FuzzyHexResult | null {
  const hexDigits = extractHexDigits(input);
  if (hexDigits.length === 0) {
    return null;
  }
  return expandHexDigits(hexDigits);
}
