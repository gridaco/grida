/**
 * RGB color tuple in RGB888 format.
 *
 * @unit RGB888
 * @spec RGB values as unsigned 8-bit integers (0-255)
 * @format [r, g, b]
 * @example [98, 116, 142] // slate-500
 */
type RGB = [number, number, number];

/**
 * Tailwind CSS color shade identifier.
 *
 * @spec Valid shades: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
 */
type ColorShade =
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
 * Tailwind CSS v4 color palette in RGB888 format.
 *
 * @unit RGB888
 * @spec RGB values as unsigned 8-bit integers (0-255)
 * @format { [colorFamily]: { [shade]: [r, g, b] } }
 * @example colors.slate["500"] // [98, 116, 142]
 */
declare const colors: {
  amber: Record<ColorShade, RGB>;
  blue: Record<ColorShade, RGB>;
  cyan: Record<ColorShade, RGB>;
  emerald: Record<ColorShade, RGB>;
  fuchsia: Record<ColorShade, RGB>;
  gray: Record<ColorShade, RGB>;
  green: Record<ColorShade, RGB>;
  indigo: Record<ColorShade, RGB>;
  lime: Record<ColorShade, RGB>;
  neutral: Record<ColorShade, RGB>;
  orange: Record<ColorShade, RGB>;
  pink: Record<ColorShade, RGB>;
  purple: Record<ColorShade, RGB>;
  red: Record<ColorShade, RGB>;
  rose: Record<ColorShade, RGB>;
  sky: Record<ColorShade, RGB>;
  slate: Record<ColorShade, RGB>;
  stone: Record<ColorShade, RGB>;
  teal: Record<ColorShade, RGB>;
  violet: Record<ColorShade, RGB>;
  yellow: Record<ColorShade, RGB>;
  zinc: Record<ColorShade, RGB>;
};

export default colors;
