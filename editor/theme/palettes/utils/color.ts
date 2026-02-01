/**
 * A generic HSL color model used across the theme system.
 *
 * Values:
 * - `h`: hue in degrees (0–360)
 * - `s`: saturation in percent (0–100)
 * - `l`: lightness in percent (0–100)
 */
export type HSL = { h: number; s: number; l: number };

/**
 * Clamp a number into \([min, max]\).
 */
function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Normalize an HSL triple into stable ranges.
 */
export function normalizeHsl(hsl: HSL): HSL {
  return {
    h: ((hsl.h % 360) + 360) % 360,
    s: clamp(hsl.s, 0, 100),
    l: clamp(hsl.l, 0, 100),
  };
}

/**
 * Parse a hex color (\`#rgb\` or \`#rrggbb\`) into RGB.
 */
export function parseHexColor(
  hex: string
): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (![3, 6].includes(normalized.length)) return null;
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Convert an RGB triple \([0..255]\) to HSL.
 */
export function rgbToHsl(rgb: { r: number; g: number; b: number }): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return normalizeHsl({ h, s: s * 100, l: l * 100 });
}

/**
 * Convert a hex color (\`#rgb\` / \`#rrggbb\`) to HSL.
 */
export function hexToHsl(hex: string): HSL | null {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb);
}
