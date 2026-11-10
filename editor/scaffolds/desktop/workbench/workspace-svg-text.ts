import type { NodeId, SvgEditor } from "@grida/svg-editor";
import { NativeEditorSvgText } from "@grida/desktop-bridge";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import type { EditorGroupState } from "./editor-group";

type Target = Readonly<{
  id: string;
  basis: EditorGroupState;
  relPath: string;
  path: string;
  editor: SvgEditor;
  node: NodeId;
  version: number;
  unwatch(): void;
}>;

/** One captured editable text selection in an ordinary workspace SVG. */
export class WorkspaceSvgText {
  private readonly editors = new Map<string, SvgEditor>();
  private target: Target | undefined;

  constructor(private readonly view: () => EditorGroupState) {}

  register(relPath: string, editor: SvgEditor): () => void {
    if (this.target?.relPath === relPath && this.target.editor !== editor)
      this.withdraw();
    this.editors.set(relPath, editor);
    return () => {
      if (this.editors.get(relPath) !== editor) return;
      this.editors.delete(relPath);
      if (this.target?.editor === editor) this.withdraw();
    };
  }

  capture(): string | undefined {
    if (this.target && this.isCurrent(this.target)) return this.target.id;
    this.withdraw();
    const basis = this.view();
    const relPath = basis.active;
    if (!relPath) return;
    const editor = this.editors.get(relPath);
    const path = WorkspaceArtifact.toAgentPath(relPath);
    if (!editor || !path || editor.state.mode !== "select") return;
    const selected = editor.read_selected_text();
    if (selected?.tag !== "text" || !NativeEditorSvgText.isText(selected.text))
      return;
    const target: Target = {
      id: crypto.randomUUID(),
      basis,
      relPath,
      path,
      editor,
      node: selected.id,
      version: editor.state.content_version,
      unwatch: editor.subscribe(() => {
        if (this.target === target && !this.isCurrent(target)) this.withdraw();
      }),
    };
    this.target = target;
    return target.id;
  }

  invoke(request: NativeEditorSvgText.Request): NativeEditorSvgText.Result {
    const target = this.target;
    if (
      !target ||
      target.id !== request.targetId ||
      !this.isCurrent(target) ||
      Date.now() >= request.expiresAtMs
    )
      return { kind: "unavailable" };
    const selection = target.editor.read_selected_text();
    if (
      !selection ||
      selection.id !== target.node ||
      !NativeEditorSvgText.isText(selection.text)
    )
      return { kind: "unavailable" };
    const { operation } = request;
    if (operation.kind === "read")
      return {
        kind: "read",
        path: target.path,
        revision: target.id,
        text: selection.text,
      };
    if (operation.revision !== target.id) return { kind: "stale" };
    if (!NativeEditorSvgText.isText(operation.text))
      return { kind: "unavailable" };
    if (operation.text === selection.text)
      return { kind: "unchanged", path: target.path, saved: false };
    target.editor.commands.set_text(operation.text);
    if (target.editor.state.content_version === target.version)
      return { kind: "unavailable" };
    return { kind: "applied", path: target.path, saved: false };
  }

  private isCurrent(target: Target): boolean {
    const state = target.editor.state;
    return (
      this.view() === target.basis &&
      this.editors.get(target.relPath) === target.editor &&
      state.mode === "select" &&
      state.selection.length === 1 &&
      state.selection[0] === target.node &&
      state.content_version === target.version
    );
  }

  private withdraw(): void {
    const target = this.target;
    this.target = undefined;
    target?.unwatch();
  }
}
