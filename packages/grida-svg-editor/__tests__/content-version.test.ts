// Verifies `editor.state.content_version` bumps on document mutations
// only — not on UI-state emissions like selection, scope, mode, or tool.
// Sibling to `version`, `structure_version`, `geometry_version`, and
// `load_version`.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src";

const SVG_A = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10" fill="red"/><text id="t" x="20" y="20">hello</text></svg>`;
const SVG_B = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle id="c" cx="50" cy="50" r="10" fill="blue"/></svg>`;

function idByTag(editor: ReturnType<typeof createSvgEditor>, tag: string) {
  return [...editor.tree().nodes.values()].find((n) => n.tag === tag)!.id;
}

describe("editor.state.content_version", () => {
  it("starts at 0 on a fresh editor (constructor input is the factory state)", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    expect(editor.state.content_version).toBe(0);
  });

  it("does NOT bump on selection change", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    const rect_id = idByTag(editor, "rect");
    const c0 = editor.state.content_version;
    const v0 = editor.state.version;
    editor.commands.select(rect_id);
    expect(editor.state.version).toBeGreaterThan(v0);
    expect(editor.state.content_version).toBe(c0);
  });

  it("does NOT bump on deselect", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    editor.commands.select(idByTag(editor, "rect"));
    const c0 = editor.state.content_version;
    editor.commands.select([]);
    expect(editor.state.content_version).toBe(c0);
  });

  it("does NOT bump on tool change", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    const c0 = editor.state.content_version;
    editor.set_tool({ type: "insert", tag: "rect" });
    expect(editor.state.content_version).toBe(c0);
    editor.set_tool({ type: "cursor" });
    expect(editor.state.content_version).toBe(c0);
  });

  it("does NOT bump on scope enter/exit", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    const rect_id = idByTag(editor, "rect");
    const c0 = editor.state.content_version;
    editor.commands.enter_scope(rect_id);
    expect(editor.state.content_version).toBe(c0);
    editor.commands.exit_scope();
    expect(editor.state.content_version).toBe(c0);
  });

  it("bumps on attribute write", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    editor.commands.select(idByTag(editor, "rect"));
    const c0 = editor.state.content_version;
    editor.commands.set_property("fill", "green");
    expect(editor.state.content_version).toBeGreaterThan(c0);
  });

  it("bumps on text edit", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    editor.commands.select(idByTag(editor, "text"));
    const c0 = editor.state.content_version;
    editor.commands.set_text("changed");
    expect(editor.state.content_version).toBeGreaterThan(c0);
  });

  it("bumps on remove / undo / redo", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    editor.commands.select(idByTag(editor, "rect"));
    const c0 = editor.state.content_version;
    editor.commands.remove();
    const c1 = editor.state.content_version;
    expect(c1).toBeGreaterThan(c0);
    editor.commands.undo();
    const c2 = editor.state.content_version;
    expect(c2).toBeGreaterThan(c1);
    editor.commands.redo();
    expect(editor.state.content_version).toBeGreaterThan(c2);
  });

  it("bumps on editor.load(svg)", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    const c0 = editor.state.content_version;
    editor.load(SVG_B);
    expect(editor.state.content_version).toBeGreaterThan(c0);
  });

  it("is selector-stable: subscribe_with_selector(s => s.content_version, ...) fires only on mutations", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    const seen: number[] = [];
    editor.subscribe_with_selector(
      (s) => s.content_version,
      (next) => seen.push(next)
    );
    // UI-state emissions — must not fire the selector.
    editor.commands.select(idByTag(editor, "rect"));
    editor.commands.select([]);
    editor.set_tool({ type: "insert", tag: "rect" });
    expect(seen).toEqual([]);
    // Mutation — fires once.
    editor.commands.select(idByTag(editor, "rect"));
    editor.commands.set_property("fill", "green");
    expect(seen.length).toBe(1);
  });
});
