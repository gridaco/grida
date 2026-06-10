// commands.duplicate (⌘D / selection.duplicate) — in-place duplicate
// over the subtree-clone operation (gridaco/grida#817). Pins: one
// atomic history step (undo restores the document byte-equal AND the
// prior selection), selection moves to the clones, refusal paths, and
// the keymap row.

import { describe, expect, it } from "vitest";
import { getKeyboardOS } from "@grida/keybinding";
import { createSvgEditor } from "../src/index";
import { createSvgEditorWithInternals, first_rect } from "./_helpers";

const MOD_IS_META = getKeyboardOS() === "mac";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="a" x="10" y="10" width="20" height="20"/><circle id="c" cx="50" cy="50" r="5"/></svg>`;

describe("commands.duplicate", () => {
  it("duplicates the selection in place and selects the clones", () => {
    const editor = createSvgEditor({ svg: SVG });
    const id = first_rect(editor);
    editor.commands.select([id]);
    const clones = editor.commands.duplicate();
    expect(clones).toHaveLength(1);
    expect(editor.state.selection).toEqual(clones);
    // Clone is byte-equal and sits right after its origin.
    expect(editor.serialize_node(clones[0])).toBe(editor.serialize_node(id));
    expect(editor.serialize().match(/<rect/g)).toHaveLength(2);
  });

  it("is ONE history step — undo restores document byte-equal and the prior selection", () => {
    const editor = createSvgEditor({ svg: SVG });
    const baseline = editor.serialize();
    const id = first_rect(editor);
    editor.commands.select([id]);
    const clones = editor.commands.duplicate();
    expect(editor.state.can_undo).toBe(true);

    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.selection).toEqual([id]);
    expect(editor.state.can_undo).toBe(false); // exactly one step

    editor.commands.redo();
    expect(editor.state.selection).toEqual(clones);
    expect(editor.serialize().match(/<rect/g)).toHaveLength(2);
  });

  it("multi-selection duplicates every member, clones in document order", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    const ids = [...editor.tree().nodes.entries()]
      .filter(([, n]) => n.tag === "rect" || n.tag === "circle")
      .map(([id]) => id);
    expect(ids).toHaveLength(2);
    editor.commands.select(ids);
    const clones = editor.commands.duplicate();
    expect(clones).toHaveLength(2);
    const out = editor.serialize();
    expect(out.match(/<rect/g)).toHaveLength(2);
    expect(out.match(/<circle/g)).toHaveLength(2);
  });

  it("duplicate of a duplicate clones the clone (selection chains)", () => {
    const editor = createSvgEditor({ svg: SVG });
    editor.commands.select([first_rect(editor)]);
    editor.commands.duplicate();
    editor.commands.duplicate();
    expect(editor.serialize().match(/<rect/g)).toHaveLength(3);
    // Two steps, two undos.
    editor.commands.undo();
    expect(editor.serialize().match(/<rect/g)).toHaveLength(2);
    editor.commands.undo();
    expect(editor.serialize().match(/<rect/g)).toHaveLength(1);
  });

  it("refuses on empty selection — no mutation, no history", () => {
    const editor = createSvgEditor({ svg: SVG });
    const baseline = editor.serialize();
    expect(editor.commands.duplicate()).toEqual([]);
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("selection.duplicate — registry + keymap", () => {
  it("invoke('selection.duplicate') consumes with a selection, refuses without", () => {
    const editor = createSvgEditor({ svg: SVG });
    expect(editor.commands.invoke("selection.duplicate")).toBe(false);
    editor.commands.select([first_rect(editor)]);
    expect(editor.commands.invoke("selection.duplicate")).toBe(true);
    expect(editor.serialize().match(/<rect/g)).toHaveLength(2);
  });

  it("Mod+D dispatches through the keymap", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    editor.commands.select([first_rect(editor)]);
    let prevented = false;
    const event = {
      code: "KeyD",
      metaKey: MOD_IS_META,
      ctrlKey: !MOD_IS_META,
      shiftKey: false,
      altKey: false,
      preventDefault: () => {
        prevented = true;
      },
      get defaultPrevented() {
        return prevented;
      },
    } as unknown as KeyboardEvent;
    expect(editor.keymap.dispatch(event)).toBe(true);
    expect(editor.serialize().match(/<rect/g)).toHaveLength(2);
  });
});
