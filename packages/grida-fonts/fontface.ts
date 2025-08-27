/**
 * FontFace-based font manager using CSS Font Loading API
 * Replaces the stylesheet approach with direct FontFace loading
 */

import type { GoogleWebFontListItem } from "./google";

export interface FontAxis {
  tag: string;
  start: number;
  end: number;
}

// Extend the existing interface from google.ts
export interface GoogleWebFontListItemWithAxes extends GoogleWebFontListItem {
  axes?: FontAxis[];
}

/**
 * Maps variant strings to CSS font-weight and font-style values
 */
const VARIANT_MAP: Record<string, { weight: string; style: string }> = {
  "100": { weight: "100", style: "normal" },
  "100italic": { weight: "100", style: "italic" },
  "200": { weight: "200", style: "normal" },
  "200italic": { weight: "200", style: "italic" },
  "300": { weight: "300", style: "normal" },
  "300italic": { weight: "300", style: "italic" },
  regular: { weight: "400", style: "normal" },
  italic: { weight: "400", style: "italic" },
  "500": { weight: "500", style: "normal" },
  "500italic": { weight: "500", style: "italic" },
  "600": { weight: "600", style: "normal" },
  "600italic": { weight: "600", style: "italic" },
  "700": { weight: "700", style: "normal" },
  "700italic": { weight: "700", style: "italic" },
  "800": { weight: "800", style: "normal" },
  "800italic": { weight: "800", style: "italic" },
  "900": { weight: "900", style: "normal" },
  "900italic": { weight: "900", style: "italic" },
};

/**
 * Converts a variant string to CSS font-weight and font-style
 */
function parseVariant(variant: string): { weight: string; style: string } {
  return VARIANT_MAP[variant] || { weight: "400", style: "normal" };
}

/**
 * Determines the font format from a URL
 */
function getFontFormat(url: string): string {
  const extension = url.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "woff2":
      return "woff2";
    case "woff":
      return "woff";
    case "ttf":
      return "truetype";
    case "otf":
      return "opentype";
    case "eot":
      return "embedded-opentype";
    default:
      return "truetype"; // fallback
  }
}

/**
 * Creates a FontFace descriptor for a given font variant
 */
function createFontFaceDescriptor(
  family: string,
  variant: string,
  { display }: { display: FontFaceDescriptors["display"] } = { display: "auto" }
): FontFaceDescriptors {
  const { weight, style } = parseVariant(variant);

  return {
    style,
    weight,
    display,
  };
}

/**
 * Creates FontFace objects for a static font family
 */
function createStaticFontFaces(
  font: GoogleWebFontListItemWithAxes
): FontFace[] {
  const fontFaces: FontFace[] = [];

  for (const [variant, url] of Object.entries(font.files)) {
    const descriptor = createFontFaceDescriptor(font.family, variant);
    const format = getFontFormat(url);
    const src = `url(${url}) format('${format}')`;
    const fontFace = new FontFace(font.family, src, descriptor);
    fontFaces.push(fontFace);
  }

  return fontFaces;
}

/**
 * Creates FontFace objects for a variable font family
 */
function createVariableFontFaces(
  font: GoogleWebFontListItemWithAxes
): FontFace[] {
  const fontFaces: FontFace[] = [];

  if (!font.axes || font.axes.length === 0) {
    // Fallback to static font creation if no axes defined
    return createStaticFontFaces(font);
  }

  // For variable fonts, we typically have one file with all variants
  // We'll create FontFace objects for each variant that maps to the variable font
  for (const variant of font.variants) {
    const url = font.files[variant];
    if (!url) continue;

    const { weight, style } = parseVariant(variant);

    // For variable fonts, we need to determine the weight range
    const weightAxis = font.axes.find((axis) => axis.tag === "wght");
    const weightRange = weightAxis
      ? `${weightAxis.start} ${weightAxis.end}`
      : weight;

    // Handle width axis for font-stretch
    const widthAxis = font.axes.find((axis) => axis.tag === "wdth");
    const stretch = widthAxis
      ? `${widthAxis.start}% ${widthAxis.end}%`
      : "normal";

    // Handle slant axis for font-style: oblique
    const slantAxis = font.axes.find((axis) => axis.tag === "slnt");
    let finalStyle = style;
    if (slantAxis && slantAxis.start !== 0) {
      // If slant axis exists and has non-zero values, use oblique
      finalStyle = `oblique ${slantAxis.start}deg ${slantAxis.end}deg`;
    }

    const descriptor: FontFaceDescriptors = {
      style: finalStyle,
      weight: weightRange,
      stretch,
      display: "swap",
    };

    const format = getFontFormat(url);
    const src = `url(${url}) format('${format}')`;
    const fontFace = new FontFace(font.family, src, descriptor);
    fontFaces.push(fontFace);
  }

  return fontFaces;
}

/**
 * FontFace manager class for better control and tracking
 */
class FontFaceManager {
  private loadedFonts = new Map<string, FontFace[]>();

  /**
   * Static method to load a font family using FontFace API
   */
  static async loadFontFamily(
    font: GoogleWebFontListItemWithAxes
  ): Promise<void> {
    const fontFaces =
      font.axes && font.axes.length > 0
        ? createVariableFontFaces(font)
        : createStaticFontFaces(font);

    // Load all FontFace objects
    const loadPromises = fontFaces.map((fontFace) => fontFace.load());
    await Promise.all(loadPromises);

    // Add all loaded fonts to document.fonts
    fontFaces.forEach((fontFace) => {
      document.fonts.add(fontFace);
    });
  }

  /**
   * Static method to load multiple font families
   */
  static async loadFontFamilies(fonts: GoogleWebFontListItem[]): Promise<void> {
    const loadPromises = fonts.map((font) =>
      FontFaceManager.loadFontFamily(font)
    );
    await Promise.all(loadPromises);
  }

  /**
   * Static method to check if a font family is already loaded
   */
  static isFontFamilyLoaded(family: string): boolean {
    return document.fonts.check(`12px "${family}"`);
  }

  /**
   * Static method to unload a font family (removes from document.fonts)
   */
  static unloadFontFamily(family: string): void {
    // Note: FontFace API doesn't provide a direct way to unload fonts
    // This is a limitation - fonts will remain in memory until page reload
    // We can only remove FontFace objects that we've explicitly added
    console.warn(`Font unloading is not supported by FontFace API: ${family}`);
  }

  /**
   * Instance method to load a font family and track it
   */
  async loadFontFamily(font: GoogleWebFontListItemWithAxes): Promise<void> {
    if (this.loadedFonts.has(font.family)) {
      return; // Already loaded
    }

    const fontFaces =
      font.axes && font.axes.length > 0
        ? createVariableFontFaces(font)
        : createStaticFontFaces(font);

    // Load all FontFace objects
    const loadPromises = fontFaces.map((fontFace) => fontFace.load());
    await Promise.all(loadPromises);

    // Add all loaded fonts to document.fonts
    fontFaces.forEach((fontFace) => {
      document.fonts.add(fontFace);
    });

    // Track loaded fonts
    this.loadedFonts.set(font.family, fontFaces);
  }

  /**
   * Instance method to load multiple font families
   */
  async loadFontFamilies(fonts: GoogleWebFontListItem[]): Promise<void> {
    const loadPromises = fonts.map((font) => this.loadFontFamily(font));
    await Promise.all(loadPromises);
  }

  /**
   * Instance method to check if a font family is loaded
   */
  isFontFamilyLoaded(family: string): boolean {
    return (
      this.loadedFonts.has(family) || FontFaceManager.isFontFamilyLoaded(family)
    );
  }

  /**
   * Gets all loaded font families
   */
  getLoadedFontFamilies(): string[] {
    return Array.from(this.loadedFonts.keys());
  }

  /**
   * Clears all tracked fonts (doesn't actually unload them)
   */
  clear(): void {
    this.loadedFonts.clear();
  }
}

// Export only the class and types
export { FontFaceManager };
