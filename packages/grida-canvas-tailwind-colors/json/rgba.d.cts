import type { ColorName, ColorShade, RGBA } from "../types.js";

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
declare const colors: Record<ColorName, Record<ColorShade, RGBA>>;

export = colors;
