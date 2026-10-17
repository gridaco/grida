import type { ColorName, ColorShade } from "./shared";

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
 * Tailwind CSS v4 color palette in RGB32F format.
 *
 * @unit RGB32F
 * @spec RGB values as 32-bit floating-point numbers (0.0-1.0)
 * @format { [colorFamily]: { [shade]: [r, g, b] } }
 * @example colors.slate["500"] // [0.384, 0.455, 0.557]
 * @useCase WebGL, shaders, graphics APIs requiring normalized float values
 */
declare const colors: Record<ColorName, Record<ColorShade, RGBF>>;

export type { ColorName, ColorShade, RGBF };

export default colors;
