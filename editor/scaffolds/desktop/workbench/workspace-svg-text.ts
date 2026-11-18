import type { SvgEditor } from "@grida/svg-editor";
import type { NativeEditorSvgText } from "@grida/desktop-bridge";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import { SelectedSvgText } from "../shared/selected-svg-text";
import type { EditorGroup } from "./editor-group";
import { WorkbenchTab } from "./workbench-tab";

/** Bind selected-text operations to the active SVG in a workspace tab group. */
export class WorkspaceSvgText {
  private readonly editors = new Map<string, SvgEditor>();
  private readonly selection: SelectedSvgText;
  readonly hasSelection: SelectedSvgText["hasSelection"];
  readonly subscribe: SelectedSvgText["subscribe"];

  constructor(group: Pick<EditorGroup, "getSnapshot" | "subscribe">) {
    this.selection = new SelectedSvgText(() => {
      const basis = group.getSnapshot();
      const relPath = WorkbenchTab.relPath(basis.active);
      if (relPath === null) return;
      const editor = this.editors.get(relPath);
      const path = WorkspaceArtifact.toAgentPath(relPath);
      if (editor && path) return { basis, editor, path };
    }, group.subscribe);
    this.hasSelection = this.selection.hasSelection;
    this.subscribe = this.selection.subscribe;
  }

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
