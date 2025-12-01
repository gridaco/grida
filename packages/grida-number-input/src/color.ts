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
