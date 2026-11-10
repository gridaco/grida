import type { NodeId, SvgEditor } from "@grida/svg-editor";
import { NativeEditorSvgText } from "@grida/desktop-bridge";

type Surface = Readonly<{
  basis: object;
  path: string;
  editor: SvgEditor;
}>;

type Target = Surface &
  Readonly<{
    id: string;
    node: NodeId;
    version: number;
    unwatch(): void;
  }>;

/** One editable text selection captured in a live SVG editor. */
export class SelectedSvgText {
  private target: Target | undefined;

  constructor(private readonly surface: () => Surface | undefined) {}

  capture(): string | undefined {
    if (this.target && this.isCurrent(this.target)) return this.target.id;
    this.withdraw();
    const surface = this.surface();
    if (!surface || surface.editor.state.mode !== "select") return;
    const { editor } = surface;
    const selected = editor.read_selected_text();
    if (selected?.tag !== "text" || !NativeEditorSvgText.isText(selected.text))
      return;
    const target: Target = {
      id: crypto.randomUUID(),
      ...surface,
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
    const surface = this.surface();
    const state = target.editor.state;
    return (
      surface?.basis === target.basis &&
      surface.editor === target.editor &&
      surface.path === target.path &&
      state.mode === "select" &&
      state.selection.length === 1 &&
      state.selection[0] === target.node &&
      state.content_version === target.version
    );
  }

  surfaceChanged(): void {
    if (this.target && !this.isCurrent(this.target)) this.withdraw();
  }

  private withdraw(): void {
    const target = this.target;
    this.target = undefined;
    target?.unwatch();
  }
}
