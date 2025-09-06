import { FontFaceManager } from "@grida/fonts/fontface-dom";
import type { editor } from "..";
import type { Editor } from "../editor";

/**
 * DOM specific font loader that registers loaded fonts to document.fonts
 */
export class DOMFontManagerAgentInterfaceProvider
  implements editor.api.IDocumentFontManagerAgentInterfaceProvider
{
  private manager: FontFaceManager;
  private loadedFonts = new Set<string>();

  constructor(readonly editor: Editor) {
    this.manager = new FontFaceManager();
  }

  async loadFont(font: { family: string }): Promise<void> {
    if (this.loadedFonts.has(font.family)) return;
    const detail = await this.editor.getFontDetails(font.family);
    if (detail) {
      await this.manager.loadGoogleFont(detail.font);
      this.loadedFonts.add(font.family);
    }
  }

  /**
   * Returns a list of fonts that have been loaded via {@link loadFont}.
   */
  listLoadedFonts(): string[] {
    return Array.from(this.loadedFonts);
  }

  setFallbackFonts(fonts: string[]): void {
    // TODO: implement explicit font fallback management.
  }
}
