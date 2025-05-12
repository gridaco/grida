const darklavender = {
  light: {
    "--background": { h: 158.49, s: 0, l: 0 },
    "--foreground": { h: 261.6, s: 100, l: 90.2 },
    "--muted": { h: 192, s: 0, l: 26.15 },
    "--muted-foreground": { h: 180, s: 2.78, l: 85.88 },
    "--popover": { h: 158.46, s: 0, l: 0 },
    "--popover-foreground": { h: 261.51, s: 100, l: 90.24 },
    "--card": { h: 158.49, s: 0, l: 0 },
    "--card-foreground": { h: 261.6, s: 100, l: 90.2 },
    "--border": { h: 0, s: 0, l: 79.61 },
    "--input": { h: 180, s: 2.78, l: 85.88 },
    "--primary": { h: 261.6, s: 100, l: 90.2 },
    "--primary-foreground": { h: 158.46, s: 0, l: 0 },
    "--secondary": { h: 105, s: 0, l: 30.77 },
    "--secondary-foreground": { h: 158.46, s: 0, l: 0 },
    "--accent": { h: 261.6, s: 100, l: 90.2 },
    "--accent-foreground": { h: 158.46, s: 0, l: 0 },
    "--destructive": { h: 2, s: 100, l: 78.73 },
    "--ring": { h: 215.06, s: 0, l: 79.62 },
    "--radius": "0.5rem",
  },
  dark: {
    "--background": { h: 158.49, s: 0, l: 0 },
    "--foreground": { h: 261.6, s: 100, l: 90.2 },
    "--muted": { h: 192, s: 0, l: 26.15 },
    "--muted-foreground": { h: 180, s: 2.78, l: 85.88 },
    "--popover": { h: 158.46, s: 0, l: 0 },
    "--popover-foreground": { h: 261.51, s: 100, l: 90.24 },
    "--card": { h: 158.49, s: 0, l: 0 },
    "--card-foreground": { h: 261.6, s: 100, l: 90.2 },
    "--border": { h: 0, s: 0, l: 79.61 },
    "--input": { h: 180, s: 2.78, l: 85.88 },
    "--primary": { h: 261.6, s: 100, l: 90.2 },
    "--primary-foreground": { h: 158.46, s: 0, l: 0 },
    "--secondary": { h: 105, s: 0, l: 30.77 },
    "--secondary-foreground": { h: 158.46, s: 0, l: 0 },
    "--accent": { h: 261.6, s: 100, l: 90.2 },
    "--accent-foreground": { h: 158.46, s: 0, l: 0 },
    "--destructive": { h: 2, s: 100, l: 78.73 },
    "--ring": { h: 215.06, s: 0, l: 79.62 },
    "--radius": "0.5rem",
  },
} as const;

export default darklavender;

// HSL to OKLCH conversion utility
function hslToOklch(
  hue: number,
  saturation: number,
  lightness: number
): string {
  // Convert HSL to RGB
  const h1 = hue / 360;
  const s1 = saturation / 100;
  const l1 = lightness / 100;

  let r, g, b;

  if (s1 === 0) {
    r = g = b = l1;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l1 < 0.5 ? l1 * (1 + s1) : l1 + s1 - l1 * s1;
    const p = 2 * l1 - q;

    r = hue2rgb(p, q, h1 + 1 / 3);
    g = hue2rgb(p, q, h1);
    b = hue2rgb(p, q, h1 - 1 / 3);
  }

  // Convert RGB to OKLCH
  // Using a simplified conversion that approximates OKLCH values
  // Note: This is an approximation. For more accurate results, you might want to use a color conversion library
  const r1 = r * 255;
  const g1 = g * 255;
  const b1 = b * 255;

  // Convert to OKLCH (approximate)
  const l_linear = 0.4122214708 * r1 + 0.5363325363 * g1 + 0.0514459929 * b1;
  const m_linear = 0.2119034982 * r1 + 0.6806995451 * g1 + 0.1073969566 * b1;
  const s_linear = 0.0883024619 * r1 + 0.2817188376 * g1 + 0.6299787005 * b1;

  const l_cbrt = Math.pow(l_linear, 1 / 3);
  const m_cbrt = Math.pow(m_linear, 1 / 3);
  const s_cbrt = Math.pow(s_linear, 1 / 3);

  const l2 =
    0.2104542553 * l_cbrt + 0.793617785 * m_cbrt - 0.0040720468 * s_cbrt;
  const a =
    1.9779984951 * l_cbrt - 2.428592205 * m_cbrt + 0.4505937099 * s_cbrt;
  const b2 =
    0.0259040371 * l_cbrt + 0.7827717662 * m_cbrt - 0.808675766 * s_cbrt;

  const c = Math.sqrt(a * a + b2 * b2);
  const h2 = (Math.atan2(b2, a) * 180) / Math.PI;

  return `oklch(${l2.toFixed(3)} ${c.toFixed(3)} ${h2.toFixed(1)})`;
}
