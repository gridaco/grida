/**
 * DOM-specific FontFace adapter for browser environments
 * Implements FontAdapter interface for DOM FontFace API
 */

import {
  UnifiedFontManager,
  type FontAdapter,
  type FontAdapterHandle,
  type FontVariant,
} from "./fontface";
import type { GoogleWebFontListItem } from "./google";

export class DomFontAdapter implements FontAdapter {
  constructor(private d: Document = document) {}

  async onRegister(
    bytes: ArrayBuffer,
    v: FontVariant
  ): Promise<FontAdapterHandle> {
    const descriptors: FontFaceDescriptors = {
      style: v.style ?? "normal",
      weight: String(v.weight ?? "400"),
      stretch: v.stretch ?? "normal",
      display: v.display ?? "auto",
    };
    const face = new FontFace(v.family, bytes, descriptors);
    await face.load();
    this.d.fonts.add(face);
    return { id: face };
  }

  onUnregister(handle: FontAdapterHandle, v: FontVariant): void {
    const face = handle.id as FontFace;
    this.d.fonts.delete(face);
  }

  onCheck(v: FontVariant): boolean {
    return this.d.fonts.check(`1rem "${v.family}"`);
  }
}

/**
 * DOM-specific FontFace manager for browser environments
 * Extends UnifiedFontManager with DOM adapter
 */
export class FontFaceManager extends UnifiedFontManager {
  constructor(opts?: { capacity?: number; fetch?: typeof fetch }) {
    super(new DomFontAdapter(), opts);
  }

  /**
   * Static method to load a font family using FontFace API
   */
  static async loadFontFamily(font: GoogleWebFontListItem): Promise<void> {
    const manager = new FontFaceManager();
    await manager.loadGoogleFont(font);
  }

  /**
   * Static method to load multiple font families
   */
  static async loadFontFamilies(fonts: GoogleWebFontListItem[]): Promise<void> {
    const manager = new FontFaceManager();
    await manager.loadGoogleFonts(fonts);
  }

  /**
   * Static method to check if a font family is already loaded in document.fonts
   */
  static isFontFamilyLoaded(family: string): boolean {
    return document.fonts.check(`12px "${family}"`);
  }

  /**
   * Static method to unload a font family (removes from document.fonts)
   * Note: This is limited - fonts will remain in memory until page reload
   */
  static unloadFontFamily(family: string): void {
    // Note: FontFace API doesn't provide a direct way to unload fonts
    // This is a limitation - fonts will remain in memory until page reload
    // We can only remove FontFace objects that we've explicitly added
    console.warn(`Font unloading is not supported by FontFace API: ${family}`);
  }

  /**
   * Checks if a font family is loaded (both in memory and document.fonts)
   */
  isFontFamilyLoaded(family: string): boolean | Promise<boolean> {
    return this.checkGoogleFont(family);
  }
}
