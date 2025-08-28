import { FontFaceManager } from "@grida/fonts/fontface-dom";
import * as google from "@grida/fonts/google";
import type { editor } from "..";
import type { Editor } from "../editor";

/**
 * DOM specific font loader that registers loaded fonts to document.fonts
 */
export class DOMFontLoaderInterfaceProvider
  implements editor.api.IDocumentFontLoaderInterfaceProvider
{
  private manager: FontFaceManager;
  private loadedFonts = new Set<string>();
  private googleFontsCache = new Map<string, google.GoogleWebFontListItem>();

  constructor(readonly editor: Editor) {
    this.manager = new FontFaceManager();
  }

  async loadFont(font: { family: string }): Promise<void> {
    if (this.loadedFonts.has(font.family)) return;

    if (this.googleFontsCache.size === 0) {
      const list = await google.fetchWebfontList();
      list.items.forEach((f) => this.googleFontsCache.set(f.family, f));
    }

    const googleFont = this.googleFontsCache.get(font.family);
    if (googleFont) {
      await this.manager.loadGoogleFont(googleFont);
      this.loadedFonts.add(font.family);
    }
  }

  /**
   * Returns a list of fonts that have been loaded via {@link loadFont}.
   */
  listLoadedFonts(): string[] {
    return Array.from(this.loadedFonts);
  }
}
