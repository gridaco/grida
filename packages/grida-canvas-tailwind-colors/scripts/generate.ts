#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net

/**
 * Generate Tailwind CSS color variables in multiple formats
 *
 * This script reads colors from tailwindcss/colors and generates:
 * - CSS files: css/colors-{format}.css
 * - JSON files: json/colors-{format}.json
 *
 * Formats: rgba, hex, oklch
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-net scripts/generate.ts
 */

import colors from "npm:tailwindcss@^4/colors";
import Color from "npm:colorjs.io@^0.5.0";

// Colors to ignore (deprecated/renamed in v4)
const ignore = ["lightBlue", "trueGray", "coolGray", "warmGray", "blueGray"];

interface ColorEntry {
  name: string;
  hex: string;
  rgb: string;
  rgba: string;
  rgbArray: [number, number, number];
  rgbfArray: [number, number, number];
  rgbaArray: [number, number, number, number];
  oklch: string;
  oklchArray: [number, number, number];
}

/**
 * Flatten nested color objects into flat entries
 */
function flattenColors(
  obj: Record<string, any>,
  prefix = ""
): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  for (const key in obj) {
    const val = obj[key];
    if (typeof val === "string") {
      result.push([`${prefix}${key}`, val]);
    } else if (typeof val === "object" && val !== null) {
      result.push(...flattenColors(val, `${prefix}${key}-`));
    }
  }
  return result;
}

/**
 * Convert hex color to RGB string
 */
function hexToRgb(hex: string): string {
  try {
    const color = new Color(hex);
    const [r, g, b] = color
      .to("srgb")
      .coords.map((n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255));
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return "rgb(0, 0, 0)";
  }
}

/**
 * Convert hex color to RGBA string
 */
function hexToRgba(hex: string): string {
  try {
    const color = new Color(hex);
    const [r, g, b] = color
      .to("srgb")
      .coords.map((n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255));
    return `rgba(${r}, ${g}, ${b}, 1)`;
  } catch {
    return "rgba(0, 0, 0, 1)";
  }
}

/**
 * Convert hex color to RGB array [r, g, b] (0-255)
 */
function hexToRgbArray(hex: string): [number, number, number] {
  try {
    const color = new Color(hex);
    const [r, g, b] = color
      .to("srgb")
      .coords.map((n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255));
    return [r, g, b];
  } catch {
    return [0, 0, 0];
  }
}

/**
 * Convert hex color to RGB float array [r, g, b] (0-1)
 */
function hexToRgbfArray(hex: string): [number, number, number] {
  try {
    const color = new Color(hex);
    const [r, g, b] = color
      .to("srgb")
      .coords.map((n: number) => Math.max(0, Math.min(1, n)));
    return [r, g, b];
  } catch {
    return [0, 0, 0];
  }
}

/**
 * Convert hex color to RGBA array [r, g, b, a] using exact integer parsing
 */
function hexToRgbaArrayExact(hex: string): [number, number, number, number] {
  const cleanHex = hex.replace(/^#/, "");
  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split("")
          .map((c) => c + c)
          .join("")
      : cleanHex;
  if (fullHex.length !== 6) return [0, 0, 0, 1];
  return [
    parseInt(fullHex.substring(0, 2), 16),
    parseInt(fullHex.substring(2, 4), 16),
    parseInt(fullHex.substring(4, 6), 16),
    1,
  ];
}

/**
 * Convert hex color to OKLCH string
 */
function hexToOklch(hex: string): string {
  try {
    const color = new Color(hex);
    const [l, c, h] = color.oklch;
    // Handle undefined hue (grays)
    const hValue = isNaN(h) ? "none" : h.toFixed(2);
    return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${hValue})`;
  } catch {
    return "oklch(0 0 none)";
  }
}

/**
 * Convert hex color to OKLCH array [l, c, h]
 */
function hexToOklchArray(hex: string): [number, number, number] {
  try {
    const color = new Color(hex);
    const [l, c, h] = color.oklch;
    // Handle undefined hue (grays) - use 0 as default
    const hValue = isNaN(h) ? 0 : h;
    return [l, c, hValue];
  } catch {
    return [0, 0, 0];
  }
}

/**
 * Normalize hex color format
 */
function normalizeHex(hex: string): string {
  try {
    const color = new Color(hex);
    return color.to("srgb").toString({ format: "hex" });
  } catch {
    return hex;
  }
}

// Collect all color entries
const colorEntries: ColorEntry[] = [];

for (const colorName in colors) {
  if (ignore.includes(colorName)) continue;
  if (typeof colors[colorName] !== "object") continue;

  const entries = flattenColors(colors[colorName], `${colorName}-`);

  for (const [name, hex] of entries) {
    try {
      const normalizedHex = normalizeHex(hex);
      // Use exact hex parsing for rgbaArray to avoid floating point rounding errors
      // (possibly a bug with the colorjs.io module)
      const rgbaArray = hexToRgbaArrayExact(normalizedHex);
      // Derive rgbArray from rgbaArray to ensure consistency between rgb.json and rgba.json
      // This avoids floating point rounding problems that occur when using colorjs.io directly
      colorEntries.push({
        name,
        hex: normalizedHex,
        rgb: hexToRgb(hex),
        rgba: hexToRgba(hex),
        rgbArray: [rgbaArray[0], rgbaArray[1], rgbaArray[2]],
        rgbfArray: hexToRgbfArray(hex),
        rgbaArray,
        oklch: hexToOklch(hex),
        oklchArray: hexToOklchArray(hex),
      });
    } catch (error) {
      console.warn(`⚠️  Failed to process color ${name}: ${error}`);
    }
  }
}

// Sort by color family first, then by numeric shade value
// Use deterministic tie-breaking: if shade numbers are equal, compare hex values
colorEntries.sort((a, b) => {
  const aParts = a.name.split("-");
  const bParts = b.name.split("-");
  const aShade = aParts.pop()!;
  const bShade = bParts.pop()!;
  const aFamily = aParts.join("-");
  const bFamily = bParts.join("-");

  // First compare by family name
  const familyCompare = aFamily.localeCompare(bFamily);
  if (familyCompare !== 0) return familyCompare;

  // Then compare by numeric shade value
  const aShadeNum = parseInt(aShade, 10);
  const bShadeNum = parseInt(bShade, 10);
  const shadeCompare = aShadeNum - bShadeNum;
  if (shadeCompare !== 0) return shadeCompare;

  // Tie-breaking: compare hex values for deterministic ordering
  return a.hex.localeCompare(b.hex);
});

// Generate CSS content
function generateCSS(
  entries: ColorEntry[],
  format: "hex" | "rgb" | "rgba" | "oklch"
): string {
  const lines = entries.map((entry) => {
    const value = entry[format];
    return `  --${entry.name}: ${value};`;
  });

  return `:root {\n${lines.join("\n")}\n}`;
}

// Generate JSON content (nested by color family)
function generateJSON(
  entries: ColorEntry[],
  format: "hex" | "rgb" | "rgbf" | "rgba" | "oklch"
): string {
  const obj: Record<
    string,
    Record<
      string,
      string | [number, number, number] | [number, number, number, number]
    >
  > = {};

  entries.forEach((entry) => {
    // Parse color name: "slate-500" -> { family: "slate", shade: "500" }
    const parts = entry.name.split("-");
    const shade = parts.pop()!; // Last part is the shade
    const family = parts.join("-"); // Everything else is the family name

    if (!obj[family]) {
      obj[family] = {};
    }

    if (format === "hex") {
      obj[family][shade] = entry.hex;
    } else if (format === "rgb") {
      obj[family][shade] = entry.rgbArray;
    } else if (format === "rgbf") {
      obj[family][shade] = entry.rgbfArray;
    } else if (format === "rgba") {
      obj[family][shade] = entry.rgbaArray;
    } else if (format === "oklch") {
      obj[family][shade] = entry.oklchArray;
    }
  });

  // Sort shades within each family by numeric value
  // Use deterministic tie-breaking: if shade numbers are equal, compare values
  const sortedObj: typeof obj = {};
  for (const family in obj) {
    sortedObj[family] = {};
    const shades = Object.keys(obj[family]).sort((a, b) => {
      const aNum = parseInt(a, 10);
      const bNum = parseInt(b, 10);
      const numCompare = aNum - bNum;
      if (numCompare !== 0) return numCompare;

      // Tie-breaking: compare string representation of values for deterministic ordering
      const aVal = JSON.stringify(obj[family][a]);
      const bVal = JSON.stringify(obj[family][b]);
      return aVal.localeCompare(bVal);
    });
    for (const shade of shades) {
      sortedObj[family][shade] = obj[family][shade];
    }
  }

  const jsonString = JSON.stringify(sortedObj, null, 2);

  // Inline arrays: convert multi-line arrays to single-line
  // Matches patterns like:
  //   [
  //     127,
  //     34,
  //     254,
  //     1
  //   ]
  // and converts to: [127, 34, 254, 1]
  // This regex matches arrays that span multiple lines (with 2-space indentation)
  const inlinedJson = jsonString.replace(
    /\[\s*\n\s{6}(-?\d+(?:\.\d+)?),\s*\n\s{6}(-?\d+(?:\.\d+)?),\s*\n\s{6}(-?\d+(?:\.\d+)?)(?:,\s*\n\s{6}(-?\d+(?:\.\d+)?))?\s*\n\s{4}\]/g,
    (match, n1, n2, n3, n4) => {
      if (n4 !== undefined) {
        // RGBA or OKLCH (4 elements)
        return `[${n1}, ${n2}, ${n3}, ${n4}]`;
      } else {
        // RGB (3 elements)
        return `[${n1}, ${n2}, ${n3}]`;
      }
    }
  );

  return inlinedJson;
}

// Write CSS files
const cssDir = new URL("../css", import.meta.url).pathname;

const rgbContent = generateCSS(colorEntries, "rgb");
const rgbaContent = generateCSS(colorEntries, "rgba");
const hexContent = generateCSS(colorEntries, "hex");
const oklchContent = generateCSS(colorEntries, "oklch");

await Deno.writeTextFile(`${cssDir}/rgb.css`, rgbContent);
console.log(`✅ Generated: css/rgb.css (${colorEntries.length} colors)`);

await Deno.writeTextFile(`${cssDir}/rgba.css`, rgbaContent);
console.log(`✅ Generated: css/rgba.css (${colorEntries.length} colors)`);

await Deno.writeTextFile(`${cssDir}/hex.css`, hexContent);
console.log(`✅ Generated: css/hex.css (${colorEntries.length} colors)`);

await Deno.writeTextFile(`${cssDir}/oklch.css`, oklchContent);
console.log(`✅ Generated: css/oklch.css (${colorEntries.length} colors)`);

// Write JSON files
const jsonDir = new URL("../json", import.meta.url).pathname;

const rgbJSON = generateJSON(colorEntries, "rgb");
const rgbfJSON = generateJSON(colorEntries, "rgbf");
const rgbaJSON = generateJSON(colorEntries, "rgba");
const hexJSON = generateJSON(colorEntries, "hex");
const oklchJSON = generateJSON(colorEntries, "oklch");

await Deno.writeTextFile(`${jsonDir}/rgb.json`, rgbJSON);
console.log(`✅ Generated: json/rgb.json (${colorEntries.length} colors)`);

await Deno.writeTextFile(`${jsonDir}/rgbf.json`, rgbfJSON);
console.log(`✅ Generated: json/rgbf.json (${colorEntries.length} colors)`);

await Deno.writeTextFile(`${jsonDir}/rgba.json`, rgbaJSON);
console.log(`✅ Generated: json/rgba.json (${colorEntries.length} colors)`);

await Deno.writeTextFile(`${jsonDir}/hex.json`, hexJSON);
console.log(`✅ Generated: json/hex.json (${colorEntries.length} colors)`);

await Deno.writeTextFile(`${jsonDir}/oklch.json`, oklchJSON);
console.log(`✅ Generated: json/oklch.json (${colorEntries.length} colors)`);

console.log(`🎉 Done! Generated ${colorEntries.length} color variables.`);
