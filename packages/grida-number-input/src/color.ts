export type RGB = { r: number; g: number; b: number };
export type RGBA = { r: number; g: number; b: number; a: number };

/**
 * Converts an RGB or RGBA color object to a hex string.
 *
 * @param color - RGB or RGBA color object to convert
 * @returns Hex string in uppercase format (e.g., "FF8040" or "FF8040CC")
 *
 * @example
 * rgbToHex({ r: 255, g: 128, b: 64 }) // Returns "FF8040"
 * rgbToHex({ r: 255, g: 128, b: 64, a: 0.8 }) // Returns "FF8040CC"
 */
export const rgbToHex = (color: RGB | RGBA): string => {
  const r = color.r.toString(16).padStart(2, "0");
  const g = color.g.toString(16).padStart(2, "0");
  const b = color.b.toString(16).padStart(2, "0");
  const a =
    "a" in color
      ? Math.round(color.a * 255)
          .toString(16)
          .padStart(2, "0")
      : "";
  return `${r}${g}${b}${a}`.toUpperCase();
};

/**
 * Converts a hex string to an RGB or RGBA color object.
 *
 * @param hex - Hex string (6 digits for RGB, 8 digits for RGBA)
 * @returns RGB or RGBA color object, or null if hex string is invalid
 *
 * @example
 * hexToRgb<RGB>("FF8040") // Returns { r: 255, g: 128, b: 64 }
 * hexToRgb<RGBA>("FF8040CC") // Returns { r: 255, g: 128, b: 64, a: 0.8 }
 * hexToRgb("invalid") // Returns null
 */
export const hexToRgb = <T extends RGB | RGBA>(hex: string): T | null => {
  if (!/^([0-9A-F]{6}|[0-9A-F]{8})$/i.test(hex)) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : undefined;
  return a !== undefined ? ({ r, g, b, a } as T) : ({ r, g, b } as T);
};
