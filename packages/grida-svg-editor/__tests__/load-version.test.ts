// Verifies `editor.state.load_version` bumps exactly once per
// `editor.load(svg)` call and does NOT bump on edits — the distinction
// from `structure_version` that the keynote preset relies on.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src";

const SVG_A = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10" fill="red"/><text id="t" x="20" y="20">hello</text></svg>`;
const SVG_B = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle id="c" cx="50" cy="50" r="10" fill="blue"/></svg>`;

describe("editor.state.load_version", () => {
  it("starts at 0 (constructor input is the factory state, not a load)", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    expect(editor.state.load_version).toBe(0);
  });

  it("bumps once per editor.load(svg)", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    editor.load(SVG_B);
    expect(editor.state.load_version).toBe(1);
    editor.load(SVG_A);
    expect(editor.state.load_version).toBe(2);
  });

  it("bumps even when loading the same SVG (string equality is not checked)", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    editor.load(SVG_A);
    expect(editor.state.load_version).toBe(1);
    editor.load(SVG_A);
    expect(editor.state.load_version).toBe(2);
  });

  it("does NOT bump on attribute edits", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    const rect = editor.tree().nodes.values();
    const rect_id = [...rect].find((n) => n.tag === "rect")!.id;
    editor.commands.select(rect_id);
    editor.commands.set_property("fill", "green");
    expect(editor.state.load_version).toBe(0);
  });

  it("does NOT bump on text edits", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    const text_id = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "text"
    )!.id;
    editor.commands.select(text_id);
    editor.commands.set_text("changed");
    expect(editor.state.load_version).toBe(0);
    expect(editor.state.structure_version).toBeGreaterThan(0); // sanity: structure_version bumped
  });

  it("does NOT bump on remove / undo / redo", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    const rect_id = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!.id;
    editor.commands.select(rect_id);
    editor.commands.remove();
    editor.commands.undo();
    editor.commands.redo();
    expect(editor.state.load_version).toBe(0);
  });

  it("is exposed via subscribe_with_selector for keynote-style refit-on-load", () => {
    const editor = createSvgEditor({ svg: SVG_A });
    const seen: number[] = [];
    editor.subscribe_with_selector(
      (s) => s.load_version,
      (next) => seen.push(next)
    );
    editor.load(SVG_B);
    editor.commands.select([]); // selection change — should NOT fire selector
    editor.load(SVG_A);
    expect(seen).toEqual([1, 2]);
  });
});
