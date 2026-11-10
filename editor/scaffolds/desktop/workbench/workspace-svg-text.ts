import type { SvgEditor } from "@grida/svg-editor";
import type { NativeEditorSvgText } from "@grida/desktop-bridge";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import { SelectedSvgText } from "../shared/selected-svg-text";
import type { EditorGroupState } from "./editor-group";

/** Bind selected-text operations to the active SVG in a workspace tab group. */
export class WorkspaceSvgText {
  private readonly editors = new Map<string, SvgEditor>();
  private readonly selection = new SelectedSvgText(() => {
    const basis = this.view();
    if (!basis.active) return;
    const editor = this.editors.get(basis.active);
    const path = WorkspaceArtifact.toAgentPath(basis.active);
    if (editor && path) return { basis, editor, path };
  });

  constructor(private readonly view: () => EditorGroupState) {}

  register(relPath: string, editor: SvgEditor): () => void {
    this.editors.set(relPath, editor);
    this.selection.surfaceChanged();
    return () => {
      if (this.editors.get(relPath) !== editor) return;
      this.editors.delete(relPath);
      this.selection.surfaceChanged();
    };
  }

  capture(): string | undefined {
    return this.selection.capture();
  }

  invoke(request: NativeEditorSvgText.Request): NativeEditorSvgText.Result {
    return this.selection.invoke(request);
  }
}
