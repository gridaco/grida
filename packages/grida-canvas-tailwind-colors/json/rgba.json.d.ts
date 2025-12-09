/**
 * RGBA color tuple in RGB888A32F format.
 *
 * @unit RGB888A32F
 * @spec RGB values as unsigned 8-bit integers (0-255), alpha as 32-bit float (0.0-1.0)
 * @format [r, g, b, a]
 * @note Alpha is always 1.0 for all Tailwind CSS v4 colors (fully opaque)
 * @example [98, 116, 142, 1] // slate-500
 */
type RGBA = [number, number, number, number];

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
 * Tailwind CSS v4 color palette in RGB888A32F format.
 *
 * @unit RGB888A32F
 * @spec RGB values as unsigned 8-bit integers (0-255), alpha as 32-bit float (0.0-1.0)
 * @format { [colorFamily]: { [shade]: [r, g, b, a] } }
 * @note Alpha channel is always 1.0 for all colors (fully opaque)
 * @example colors.slate["500"] // [98, 116, 142, 1]
 * @useCase Canvas rendering, CSS rgba() format compatibility
 */
declare const colors: {
  amber: Record<ColorShade, RGBA>;
  blue: Record<ColorShade, RGBA>;
  cyan: Record<ColorShade, RGBA>;
  emerald: Record<ColorShade, RGBA>;
  fuchsia: Record<ColorShade, RGBA>;
  gray: Record<ColorShade, RGBA>;
  green: Record<ColorShade, RGBA>;
  indigo: Record<ColorShade, RGBA>;
  lime: Record<ColorShade, RGBA>;
  neutral: Record<ColorShade, RGBA>;
  orange: Record<ColorShade, RGBA>;
  pink: Record<ColorShade, RGBA>;
  purple: Record<ColorShade, RGBA>;
  red: Record<ColorShade, RGBA>;
  rose: Record<ColorShade, RGBA>;
  sky: Record<ColorShade, RGBA>;
  slate: Record<ColorShade, RGBA>;
  stone: Record<ColorShade, RGBA>;
  teal: Record<ColorShade, RGBA>;
  violet: Record<ColorShade, RGBA>;
  yellow: Record<ColorShade, RGBA>;
  zinc: Record<ColorShade, RGBA>;
};

export default colors;
