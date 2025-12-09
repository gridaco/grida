/**
 * RGB color tuple in RGB32F format.
 *
 * @unit RGB32F
 * @spec RGB values as 32-bit floating-point numbers (0.0-1.0)
 * @format [r, g, b]
 * @example [0.384, 0.455, 0.557] // slate-500
 */
type RGBF = [number, number, number];

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
 * Tailwind CSS v4 color palette in RGB32F format.
 *
 * @unit RGB32F
 * @spec RGB values as 32-bit floating-point numbers (0.0-1.0)
 * @format { [colorFamily]: { [shade]: [r, g, b] } }
 * @example colors.slate["500"] // [0.384, 0.455, 0.557]
 * @useCase WebGL, shaders, graphics APIs requiring normalized float values
 */
declare const colors: {
  amber: Record<ColorShade, RGBF>;
  blue: Record<ColorShade, RGBF>;
  cyan: Record<ColorShade, RGBF>;
  emerald: Record<ColorShade, RGBF>;
  fuchsia: Record<ColorShade, RGBF>;
  gray: Record<ColorShade, RGBF>;
  green: Record<ColorShade, RGBF>;
  indigo: Record<ColorShade, RGBF>;
  lime: Record<ColorShade, RGBF>;
  neutral: Record<ColorShade, RGBF>;
  orange: Record<ColorShade, RGBF>;
  pink: Record<ColorShade, RGBF>;
  purple: Record<ColorShade, RGBF>;
  red: Record<ColorShade, RGBF>;
  rose: Record<ColorShade, RGBF>;
  sky: Record<ColorShade, RGBF>;
  slate: Record<ColorShade, RGBF>;
  stone: Record<ColorShade, RGBF>;
  teal: Record<ColorShade, RGBF>;
  violet: Record<ColorShade, RGBF>;
  yellow: Record<ColorShade, RGBF>;
  zinc: Record<ColorShade, RGBF>;
};

export default colors;
