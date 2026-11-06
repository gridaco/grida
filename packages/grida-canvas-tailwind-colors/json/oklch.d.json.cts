import type { ColorName, ColorShade, OKLCH } from "../types.js";

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
declare const colors: Record<ColorName, Record<ColorShade, OKLCH>>;

export = colors;
