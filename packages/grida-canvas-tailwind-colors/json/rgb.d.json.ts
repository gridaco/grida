import type { ColorName, ColorShade } from "./shared";

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
 * Tailwind CSS v4 color palette in RGB888 format.
 *
 * @unit RGB888
 * @spec RGB values as unsigned 8-bit integers (0-255)
 * @format { [colorFamily]: { [shade]: [r, g, b] } }
 * @example colors.slate["500"] // [98, 116, 142]
 */
declare const colors: Record<ColorName, Record<ColorShade, RGB>>;

export type { ColorName, ColorShade, RGB };

export default colors;
