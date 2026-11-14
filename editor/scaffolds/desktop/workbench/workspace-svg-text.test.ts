import { createSvgEditor } from "@grida/svg-editor";
import type { NativeEditorSvgText } from "@grida/desktop-bridge";
import { expect, it } from "vitest";
import { EditorGroup } from "./editor-group";
import { WorkbenchTab } from "./workbench-tab";

const file = WorkbenchTab.file;
import { WorkspaceSvgText } from "./workspace-svg-text";

const source =
  '<svg xmlns="http://www.w3.org/2000/svg"><text id="title">Before</text><text id="other">Other</text><text id="mixed">A<tspan>B</tspan></text></svg>';

function fixture() {
  const editor = createSvgEditor({ svg: source });
  const group = new EditorGroup();
  const owner = new WorkspaceSvgText(group.getSnapshot);
  const close = owner.register("poster.svg", editor);
  group.open(file("poster.svg"));
  const select = (name: string) =>
    editor.commands.select(
      [...editor.tree().nodes.values()].find((node) => node.name === name)!.id
    );
  select("title");
  const call = (targetId: string, operation: NativeEditorSvgText.Operation) =>
    owner.invoke({ targetId, operation, expiresAtMs: Date.now() + 1000 });
  return { editor, group, owner, select, call, close };
}

it("reads and replaces exactly one selected SVG text run with ordinary undo", () => {
  const { editor, owner, call, close } = fixture();
  try {
    const target = owner.capture()!;
    expect(call(target, { kind: "read" })).toEqual({
      kind: "read",
      path: "/poster.svg",
      revision: target,
      text: "Before",
    });
    expect(
      call(target, {
        kind: "replace",
        revision: crypto.randomUUID(),
        text: "Wrong",
      })
    ).toEqual({ kind: "stale" });
    expect(
      call(target, { kind: "replace", revision: target, text: "After & only" })
    ).toEqual({ kind: "applied", path: "/poster.svg", saved: false });
    expect(editor.serialize()).toBe(
      source.replace("Before", "After &amp; only")
    );
    expect(call(target, { kind: "read" })).toEqual({ kind: "unavailable" });
    editor.commands.undo();
    expect(editor.serialize()).toBe(source);
    expect(owner.capture()).not.toBe(target);
  } finally {
    close();
  }
});

it("retires selection and tab changes even after returning to the same SVG", () => {
  const { group, editor, owner, select, call, close } = fixture();
  try {
    const target = owner.capture()!;
    select("other");
    select("title");
    expect(
      call(target, { kind: "replace", revision: target, text: "Wrong" })
    ).toEqual({ kind: "unavailable" });
    const next = owner.capture()!;
    group.open(file("other.svg"));
    group.activate(file("poster.svg"));
    expect(call(next, { kind: "read" })).toEqual({ kind: "unavailable" });
    select("mixed");
    expect(owner.capture()).toBeUndefined();
    expect(editor.serialize()).toBe(source);
  } finally {
    close();
  }
});
