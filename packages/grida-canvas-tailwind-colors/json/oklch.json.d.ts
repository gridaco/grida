/**
 * OKLCH color tuple.
 *
 * @unit OKLCH (perceptual color space)
 * @spec Lightness (0.0-1.0), Chroma (0.0+), Hue (0.0-360.0 degrees)
 * @format [l, c, h]
 * @note Hue may be 0 for achromatic colors (grays)
 * @example [0.384, 0.015, 255.59] // slate-500
 */
type OKLCH = [number, number, number];

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
 * Tailwind CSS v4 color palette in OKLCH format.
 *
 * @unit OKLCH (perceptual color space)
 * @spec Lightness (0.0-1.0), Chroma (0.0+), Hue (0.0-360.0 degrees)
 * @format { [colorFamily]: { [shade]: [l, c, h] } }
 * @note Hue is 0 for achromatic colors (grays)
 * @example colors.slate["500"] // [0.384, 0.015, 255.59]
 * @useCase Perceptual color operations, color mixing, modern color spaces
 */
declare const colors: {
  amber: Record<ColorShade, OKLCH>;
  blue: Record<ColorShade, OKLCH>;
  cyan: Record<ColorShade, OKLCH>;
  emerald: Record<ColorShade, OKLCH>;
  fuchsia: Record<ColorShade, OKLCH>;
  gray: Record<ColorShade, OKLCH>;
  green: Record<ColorShade, OKLCH>;
  indigo: Record<ColorShade, OKLCH>;
  lime: Record<ColorShade, OKLCH>;
  neutral: Record<ColorShade, OKLCH>;
  orange: Record<ColorShade, OKLCH>;
  pink: Record<ColorShade, OKLCH>;
  purple: Record<ColorShade, OKLCH>;
  red: Record<ColorShade, OKLCH>;
  rose: Record<ColorShade, OKLCH>;
  sky: Record<ColorShade, OKLCH>;
  slate: Record<ColorShade, OKLCH>;
  stone: Record<ColorShade, OKLCH>;
  teal: Record<ColorShade, OKLCH>;
  violet: Record<ColorShade, OKLCH>;
  yellow: Record<ColorShade, OKLCH>;
  zinc: Record<ColorShade, OKLCH>;
};

export default colors;
