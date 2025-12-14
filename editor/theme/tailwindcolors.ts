///
/// Tailwind Colors - OKLCH format
/// Uses @grida/tailwindcss-colors package for color data
///

import tailwindColorsOKLCH from "@grida/tailwindcss-colors/json/oklch.json";

/**
 * Type for OKLCH CSS string format
 */
type OklchStr = `oklch(${string})`;

/**
 * Converts OKLCH array [l, c, h] to oklch() CSS string format
 * l: 0-1 (lightness), c: 0+ (chroma), h: 0-360 (hue)
 */
function oklchArrayToString([l, c, h]: [number, number, number]): OklchStr {
  // Convert lightness from 0-1 to percentage (0-100%)
  const lPercent = l * 100;
  return `oklch(${lPercent}% ${c} ${h})` as OklchStr;
}

/**
 * Convert the package's OKLCH data structure to the expected format
 * Package format: { [colorFamily]: { [shade]: [l, c, h] } }
 * Output format: { [colorFamily]: { [shade]: "oklch(l% c h)" } }
 */
const colors = Object.fromEntries(
  Object.entries(tailwindColorsOKLCH).map(([colorName, shades]) => [
    colorName,
    Object.fromEntries(
      Object.entries(shades).map(([shade, oklch]) => [
        shade,
        oklchArrayToString(oklch as [number, number, number]),
      ])
    ),
  ])
) as {
  [K in keyof typeof tailwindColorsOKLCH]: {
    [S in keyof (typeof tailwindColorsOKLCH)[K]]: OklchStr;
  };
};

export default colors;

export type ColorName = keyof typeof colors;

export type ColorPalette = {
  "50": OklchStr;
  "100": OklchStr;
  "200": OklchStr;
  "300": OklchStr;
  "400": OklchStr;
  "500": OklchStr;
  "600": OklchStr;
  "700": OklchStr;
  "800": OklchStr;
  "900": OklchStr;
  "950": OklchStr;
};

export function randomcolorname(options?: {
  exclude?: ColorName[];
}): ColorName {
  const keys = Object.keys(colors) as ColorName[];

  // Filter out the keys that are in the exclude array
  const availableKeys = options?.exclude
    ? keys.filter((key) => !options.exclude?.includes(key))
    : keys;

  // If all colors are excluded, return a default or handle appropriately
  if (availableKeys.length === 0) {
    throw new Error("No available colors to choose from.");
  }

  // Return a random color from the available keys
  return availableKeys[Math.floor(Math.random() * availableKeys.length)];
}

export const neutral_colors: ColorName[] = [
  "neutral",
  "zinc",
  "stone",
  "slate",
  "gray",
] as const;
