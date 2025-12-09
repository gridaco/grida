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
 * Tailwind CSS v4 color palette in hexadecimal format.
 *
 * @unit Hex string
 * @spec Hexadecimal color strings in lowercase format (#rrggbb)
 * @format { [colorFamily]: { [shade]: "#rrggbb" } }
 * @example colors.slate["500"] // "#64748e"
 * @useCase Web development, CSS, human-readable color strings
 */
declare const colors: {
  amber: Record<ColorShade, string>;
  blue: Record<ColorShade, string>;
  cyan: Record<ColorShade, string>;
  emerald: Record<ColorShade, string>;
  fuchsia: Record<ColorShade, string>;
  gray: Record<ColorShade, string>;
  green: Record<ColorShade, string>;
  indigo: Record<ColorShade, string>;
  lime: Record<ColorShade, string>;
  neutral: Record<ColorShade, string>;
  orange: Record<ColorShade, string>;
  pink: Record<ColorShade, string>;
  purple: Record<ColorShade, string>;
  red: Record<ColorShade, string>;
  rose: Record<ColorShade, string>;
  sky: Record<ColorShade, string>;
  slate: Record<ColorShade, string>;
  stone: Record<ColorShade, string>;
  teal: Record<ColorShade, string>;
  violet: Record<ColorShade, string>;
  yellow: Record<ColorShade, string>;
  zinc: Record<ColorShade, string>;
};

export default colors;
