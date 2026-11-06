import type { ColorName, ColorShade, RGB } from "../types.js";

/**
 * Tailwind CSS v4 color palette in RGB888 format.
 *
 * @unit RGB888
 * @spec RGB values as unsigned 8-bit integers (0-255)
 * @format { [colorFamily]: { [shade]: [r, g, b] } }
 * @example colors.slate["500"] // [98, 116, 142]
 */
declare const colors: Record<ColorName, Record<ColorShade, RGB>>;

export = colors;
