import type { NativeEditorSurfaceSnapshot } from "@grida/desktop-bridge";
import type { SvgEditor } from "@grida/svg-editor";
import { CANVAS_PATH } from "../ai-sidebar/agent-fs-binding";
import { SelectedSvgText } from "../shared/selected-svg-text";

/** The live SVG in a dedicated file window, addressed by a virtual path. */
export class DocumentSurfaceHost {
  private editor: SvgEditor | null = null;
  private readonly listeners = new Set<() => void>();
  readonly svgText = new SelectedSvgText(() => {
    const editor = this.editor;
    if (editor) return { basis: editor, editor, path: CANVAS_PATH };
  });

  setEditor(editor: SvgEditor | null): void {
    if (this.editor === editor) return;
    this.editor = editor;
    this.svgText.surfaceChanged();
    for (const listener of this.listeners) listener();
  }

  readEditorSurfaces(): NativeEditorSurfaceSnapshot {
    return this.editor
      ? { active: CANVAS_PATH, open: [CANVAS_PATH], truncated: false }
      : { active: null, open: [], truncated: false };
  }

  subscribeToEditorSurfaces(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
