/**
 * Tailwind CSS color name identifier.
 */
export type ColorName =
  | "amber"
  | "blue"
  | "cyan"
  | "emerald"
  | "fuchsia"
  | "gray"
  | "green"
  | "indigo"
  | "lime"
  | "neutral"
  | "orange"
  | "pink"
  | "purple"
  | "red"
  | "rose"
  | "sky"
  | "slate"
  | "stone"
  | "teal"
  | "violet"
  | "yellow"
  | "zinc";

/**
 * Tailwind CSS color shade identifier.
 *
 * @spec Valid shades: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
 */
export type ColorShade =
  | "50"
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900"
  | "950";

/**
 * RGB color value in hexadecimal format.
 *
 * @unit Hex string
 * @spec Hexadecimal color strings in lowercase format (#rrggbb)
 * @format "#rrggbb"
 * @example #62748e // slate-500
 */
export type Hex = string;

/**
 * RGB color tuple in RGB888 format.
 *
 * @unit RGB888
 * @spec RGB values as unsigned 8-bit integers (0-255)
 * @format [r, g, b]
 * @example [98, 116, 142] // slate-500
 */
export type RGB = [red: number, green: number, blue: number];

/**
 * RGB color tuple in RGB32F format.
 *
 * @unit RGB32F
 * @spec RGB values as 32-bit floating-point numbers (0.0-1.0)
 * @format [r, g, b]
 * @example [0.384, 0.455, 0.557] // slate-500
 */
export type RGBF = [red: number, green: number, blue: number];

/**
 * RGBA color tuple in RGB888A32F format.
 *
 * @unit RGB888A32F
 * @spec RGB values as unsigned 8-bit integers (0-255), alpha as 32-bit float (0.0-1.0)
 * @format [r, g, b, a]
 * @note Alpha is always 1.0 for all Tailwind CSS v4 colors (fully opaque)
 * @example [98, 116, 142, 1] // slate-500
 */
export type RGBA = [red: number, green: number, blue: number, alpha: number];

/**
 * OKLCH color tuple.
 *
 * @unit OKLCH (perceptual color space)
 * @spec Lightness (0.0-1.0), Chroma (0.0+), Hue (0.0-360.0 degrees)
 * @format [l, c, h]
 * @note Hue may be 0 for achromatic colors (grays)
 * @example [0.384, 0.015, 255.59] // slate-500
 */
export type OKLCH = [lightness: number, chroma: number, hue: number];
