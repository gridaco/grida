import type { NativeEditorSurfaceSnapshot } from "@grida/desktop-bridge";
import type { SvgEditor } from "@grida/svg-editor";
import { SelectedSvg } from "../shared/selected-svg";
import { SelectedSvgText } from "../shared/selected-svg-text";

/** The virtual path a file window's live SVG is published at. */
export const CANVAS_PATH = "/canvas.svg" as const;

/** The live SVG displayed in a file window. */
export class DocumentSurfaceHost {
  private editor: SvgEditor | null = null;
  private path: string = CANVAS_PATH;
  private readonly listeners = new Set<() => void>();
  private readonly surface = () => {
    const editor = this.editor;
    if (editor) return { basis: editor, editor, path: this.path };
  };
  readonly svgText = new SelectedSvgText(this.surface);
  readonly svgSelection = new SelectedSvg(this.surface);

  setEditor(editor: SvgEditor | null, path: string = CANVAS_PATH): void {
    if (this.editor === editor && this.path === path) return;
    this.editor = editor;
    this.path = path;
    this.svgText.surfaceChanged();
    this.svgSelection.surfaceChanged();
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
