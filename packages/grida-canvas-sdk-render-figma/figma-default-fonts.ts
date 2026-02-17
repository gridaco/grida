/**
 * Figma default fonts — minimal built-in module (no new dependencies).
 * Loads the Figma default font set from CDN and registers them with the canvas.
 * See FONTS.md for strategy. Custom fonts are the user's responsibility.
 */

/** Minimal canvas interface required for font registration and fallback. */
export interface FigmaDefaultFontsCanvas {
  addFont(family: string, data: Uint8Array): void;
  setFallbackFonts(fonts: string[]): void;
}

/**
 * One URL per family. These may need updating if the CDN changes.
 * Using single-file variable or regular TTF where available.
 *
 * @see https://github.com/gridaco/fonts/blob/main/www/public/webfonts-vf.json
 */
export const FIGMA_DEFAULT_FONT_ENTRIES: { family: string; url: string }[] = [
  {
    family: "Inter",
    url: "https://fonts.gstatic.com/s/inter/v19/UcCo3FwrK3iLTfvlaQc78lA2.ttf",
  },
  {
    family: "Noto Sans KR",
    url: "https://fonts.gstatic.com/s/notosanskr/v37/PbykFmXiEBPT4ITbgNA5Cgm21nTs4JMMuA.ttf",
  },
  {
    family: "Noto Sans JP",
    url: "https://fonts.gstatic.com/s/notosansjp/v54/-F62fjtqLzI2JPCgQBnw7HFoxgIO2lZ9hg.ttf",
  },
  {
    family: "Noto Sans SC",
    url: "https://fonts.gstatic.com/s/notosanssc/v38/k3kXo84MPvpLmixcA63oeALhKYiJ-Q7m8w.ttf",
  },
  {
    family: "Noto Sans TC",
    url: "https://fonts.gstatic.com/s/notosanstc/v37/-nF7OG829Oofr2wohFbTp9iFPysLA_ZJ1g.ttf",
  },
  {
    family: "Noto Sans HK",
    url: "https://fonts.gstatic.com/s/notosanshk/v33/nKKQ-GM_FYFRJvXzVXaAPe9hNHB3Eu7mOQ.ttf",
  },
  {
    family: "Noto Color Emoji",
    url: "https://fonts.gstatic.com/s/notocoloremoji/v35/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFab5s79iz64w.ttf",
  },
];

/**
 * Fallback order for setFallbackFonts. Aligned with FONTS.md and editor DEFAULT_FONT_FALLBACK_SET.
 */
export const FIGMA_DEFAULT_FALLBACK_ORDER: string[] = [
  "Inter",
  "Noto Sans KR",
  "Noto Sans JP",
  "Noto Sans SC",
  "Noto Sans TC",
  "Noto Sans HK",
  "Noto Color Emoji",
];

/**
 * Ensures all Figma default fonts are loaded from CDN and registered with the canvas,
 * then sets the fallback font order. Call once after createCanvas when loadFigmaDefaultFonts is true.
 * Uses native fetch only (Node 18+ and browsers).
 */
export async function ensureFigmaDefaultFonts(
  canvas: FigmaDefaultFontsCanvas
): Promise<void> {
  for (const entry of FIGMA_DEFAULT_FONT_ENTRIES) {
    const res = await fetch(entry.url);
    if (!res.ok) {
      throw new Error(
        `Figma default font fetch failed: ${entry.family} ${res.status} ${res.statusText}`
      );
    }
    const buffer = await res.arrayBuffer();
    canvas.addFont(entry.family, new Uint8Array(buffer));
  }
  canvas.setFallbackFonts(FIGMA_DEFAULT_FALLBACK_ORDER);
}
