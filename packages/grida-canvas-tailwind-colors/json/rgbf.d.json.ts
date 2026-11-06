import type { ColorName, ColorShade, RGBF } from "../types.js";

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

export = colors;
