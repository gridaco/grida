import type { Editor } from "./editor";

/**
 * Observes editor state and ensures required fonts are loaded
 * using the bound font loader.
 */
export class DocumentFontManager {
  constructor(private editor: Editor) {
    // load fonts present in initial state
    this.sync();

    // watch for font registry changes
    this.editor.subscribeWithSelector(
      (state) => state.googlefonts.map((f) => f.family),
      () => {
        this.sync();
      }
    );
  }

  private sync() {
    const loaded = new Set(this.editor.listLoadedFonts());
    const fonts = this.editor.getSnapshot().googlefonts;
    for (const { family } of fonts) {
      if (loaded.has(family)) continue;
      void this.editor.loadFont({ family });
    }
  }
}
