import type { NativeEditorSurfaceSnapshot } from "@grida/desktop-bridge";
import type { SvgEditor } from "@grida/svg-editor";
import { CANVAS_PATH } from "../ai-sidebar/agent-fs-binding";
import { SelectedSvgText } from "../shared/selected-svg-text";

/** The live SVG displayed in a file window. */
export class DocumentSurfaceHost {
  private editor: SvgEditor | null = null;
  private path: string = CANVAS_PATH;
  private readonly listeners = new Set<() => void>();
  readonly svgText = new SelectedSvgText(() => {
    const editor = this.editor;
    if (editor) return { basis: editor, editor, path: this.path };
  });

  setEditor(editor: SvgEditor | null, path: string = CANVAS_PATH): void {
    if (this.editor === editor && this.path === path) return;
    this.editor = editor;
    this.path = path;
    this.svgText.surfaceChanged();
    for (const listener of this.listeners) listener();
  }

  bindEditor(editor: SvgEditor, path: string): () => void {
    this.setEditor(editor, path);
    return () => {
      if (this.editor === editor && this.path === path) this.setEditor(null);
    };
  }

  readEditorSurfaces(): NativeEditorSurfaceSnapshot {
    return this.editor
      ? { active: this.path, open: [this.path], truncated: false }
      : { active: null, open: [], truncated: false };
  }

  subscribeToEditorSurfaces(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
