/**
 * Standalone font loader for a WASM Scene — no dependency on `Editor`.
 *
 * After loading a scene (`loadSceneGrida` + `switchScene`), the WASM runtime
 * knows which fonts are referenced but missing. This utility queries that list,
 * fetches font files from Google Fonts, and registers them with the scene.
 */
import * as googlefonts from "@grida/fonts/google";
import {
  UnifiedFontManager,
  type FontAdapter,
  type FontAdapterHandle,
  type FontVariant,
} from "@grida/fonts/fontface";
import type { Scene } from "@grida/canvas-wasm";

class SceneFontAdapter implements FontAdapter {
  constructor(private scene: Scene) {}

  async onRegister(
    bytes: ArrayBuffer,
    v: FontVariant
  ): Promise<FontAdapterHandle> {
    this.scene.addFont(v.family, new Uint8Array(bytes));
    return { id: v.family };
  }

  onUnregister(): void {}
}

export class SceneFontLoader {
  private manager: UnifiedFontManager;
  private webfontlist: googlefonts.GoogleWebFontList | null = null;
  private loaded = new Set<string>();

  constructor(private scene: Scene) {
    this.manager = new UnifiedFontManager(new SceneFontAdapter(scene));
  }

  /**
   * Query the scene for missing fonts and load them from Google Fonts.
   * Safe to call multiple times — already-loaded families are skipped.
   */
  async loadMissingFonts(): Promise<void> {
    const missing = this.scene.listMissingFonts();
    const needed = missing.filter((f) => !this.loaded.has(f.family));
    if (needed.length === 0) return;

    if (!this.webfontlist) {
      this.webfontlist = await googlefonts.fetchWebfontList();
    }

    await Promise.all(needed.map((f) => this.loadFont(f.family)));
  }

  async loadFont(family: string): Promise<void> {
    if (this.loaded.has(family)) return;
    const item = this.webfontlist?.items.find((f) => f.family === family);
    if (item) {
      await this.manager.loadGoogleFont(item);
      this.loaded.add(family);
    }
  }
}
