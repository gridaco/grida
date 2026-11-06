import type { ColorName, ColorShade, Hex } from "../types.js";

/**
 * Tailwind CSS v4 color palette in hexadecimal format.
 *
 * @unit Hex string
 * @spec Hexadecimal color strings in lowercase format (#rrggbb)
 * @format { [colorFamily]: { [shade]: "#rrggbb" } }
 * @example colors.slate["500"] // "#64748e"
 * @useCase Web development, CSS, human-readable color strings
 */
declare const colors: Record<ColorName, Record<ColorShade, Hex>>;

export = colors;
