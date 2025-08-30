import type { Editor } from "./editor";
import type { editor } from ".";

/**
 * Observes editor state and ensures required fonts are loaded
 * using the bound font loader.
 */
export class DocumentFontManager {
  constructor(private editor: Editor) {
    // watch for font registry changes
    this.editor.subscribeWithSelector(
      (state) => state.fontkeys,
      (_, v) => {
        this.sync(v);
      }
    );
  }

  private sync(keys: editor.state.FontKey[]) {
    const loaded = new Set(this.editor.listLoadedFonts());
    for (const { family } of keys) {
      if (loaded.has(family)) continue;
      void this.editor.loadFont({ family });
    }
  }
}
