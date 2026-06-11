// commands.duplicate (⌘D / selection.duplicate) — in-place duplicate
// over the subtree-clone operation (gridaco/grida#817). Pins: one
// atomic history step (undo restores the document byte-equal AND the
// prior selection), selection moves to the clones, refusal paths, and
// the keymap row. The repeating-offset behavior (gridaco/grida#825)
// gets its own describe below.

import { describe, expect, it } from "vitest";
import { getKeyboardOS } from "@grida/keybinding";
import { createSvgEditor } from "../src/index";
import {
  createSvgEditorWithInternals,
  first_rect,
  install_geometry,
} from "./_helpers";

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

// Repeating offset (gridaco/grida#825; spec: subtree-clone.md
// §Repeating offset): duplicate → move the copy → duplicate again, and
// the next copy lands at the same relative offset — applied through the
// translate pipeline INSIDE the same atomic step. Every failed
// precondition degrades to plain duplicate-in-place, never a throw.
describe("commands.duplicate — repeating offset (#825)", () => {
  const attr = (
    editor: ReturnType<typeof createSvgEditor>,
    id: string,
    name: string
  ) => editor.document.get_attr(id, name);

  it("duplicate → move → duplicate repeats the translate delta", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_geometry(editor);
    editor.commands.select([first_rect(editor)]);
    const [first] = editor.commands.duplicate(); // in place at (10, 10)
    editor.commands.translate({ dx: 30, dy: 5 });
    const [second] = editor.commands.duplicate(); // repeats (+30, +5)
    expect(attr(editor, first, "x")).toBe("40");
    expect(attr(editor, second, "x")).toBe("70");
    expect(attr(editor, second, "y")).toBe("20");
  });

  it("copy + offset are ONE history step — one undo removes both, redo restores both", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_geometry(editor);
    editor.commands.select([first_rect(editor)]);
    const [first] = editor.commands.duplicate();
    editor.commands.translate({ dx: 30, dy: 0 });
    const post_move = editor.serialize();
    const [second] = editor.commands.duplicate();
    expect(attr(editor, second, "x")).toBe("70");

    editor.commands.undo();
    expect(editor.serialize()).toBe(post_move);
    expect(editor.state.selection).toEqual([first]);

    editor.commands.redo();
    expect(attr(editor, second, "x")).toBe("70");
    expect(editor.state.selection).toEqual([second]);
  });

  it("chains: every duplicate re-arms the record — copies march at a constant stride", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_geometry(editor);
    editor.commands.select([first_rect(editor)]);
    editor.commands.duplicate(); // x=10
    editor.commands.translate({ dx: 30, dy: 0 }); // x=40
    const [third] = editor.commands.duplicate(); // x=70
    const [fourth] = editor.commands.duplicate(); // x=100
    expect(attr(editor, third, "x")).toBe("70");
    expect(attr(editor, fourth, "x")).toBe("100");
  });

  it("a copy that never moved repeats nothing — the next copy is byte-equal, in place", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_geometry(editor);
    const origin = first_rect(editor);
    editor.commands.select([origin]);
    const [first] = editor.commands.duplicate();
    const [second] = editor.commands.duplicate();
    // No fabricated offset, no attribute rewrite — verbatim clone.
    expect(editor.serialize_node(second)).toBe(editor.serialize_node(first));
    expect(attr(editor, second, "x")).toBe("10");
  });

  it("repeat is unavailable without a geometry provider — degrades to in-place", () => {
    const editor = createSvgEditor({ svg: SVG }); // headless, no provider
    editor.commands.select([first_rect(editor)]);
    const [first] = editor.commands.duplicate();
    editor.commands.translate({ dx: 30, dy: 0 });
    const [second] = editor.commands.duplicate();
    expect(attr(editor, second, "x")).toBe("40"); // clone of the moved copy, in place
    expect(editor.serialize_node(second)).toBe(editor.serialize_node(first));
  });

  it("selecting anything other than the previous clones breaks the chain", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_geometry(editor);
    const origin = first_rect(editor);
    editor.commands.select([origin]);
    editor.commands.duplicate();
    editor.commands.translate({ dx: 30, dy: 0 });
    editor.commands.select([origin]); // back to the ORIGIN, not the copy
    const [copy] = editor.commands.duplicate();
    expect(attr(editor, copy, "x")).toBe("10"); // in place
  });

  it("resizing the copy breaks the rigid-translate witness — in-place", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_geometry(editor);
    editor.commands.select([first_rect(editor)]);
    editor.commands.duplicate();
    editor.commands.translate({ dx: 30, dy: 0 });
    editor.commands.set_property("width", "30"); // copy is no longer a translate of its origin
    const [copy] = editor.commands.duplicate();
    expect(attr(editor, copy, "x")).toBe("40"); // in place next to the resized copy
  });

  it("reset() forgets the previous duplication", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_geometry(editor);
    editor.commands.select([first_rect(editor)]);
    editor.commands.duplicate();
    editor.commands.translate({ dx: 30, dy: 0 });
    editor.reset();
    editor.commands.select([first_rect(editor)]);
    const [copy] = editor.commands.duplicate();
    expect(attr(editor, copy, "x")).toBe("10"); // plain in-place
  });

  it("multi-member: the union offset repeats for every member", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    install_geometry(editor);
    const ids = [...editor.tree().nodes.entries()]
      .filter(([, n]) => n.tag === "rect" || n.tag === "circle")
      .map(([id]) => id);
    editor.commands.select(ids);
    editor.commands.duplicate();
    editor.commands.translate({ dx: 5, dy: 7 });
    const clones = editor.commands.duplicate();
    expect(clones).toHaveLength(2);
    const [rect2, circle2] = clones; // document order: rect, circle
    expect(attr(editor, rect2, "x")).toBe("20"); // 10 + 5 + 5
    expect(attr(editor, rect2, "y")).toBe("24"); // 10 + 7 + 7
    expect(attr(editor, circle2, "cx")).toBe("60"); // 50 + 5 + 5
    expect(attr(editor, circle2, "cy")).toBe("64"); // 50 + 7 + 7
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
    // `dispatch` is deliberately browser-agnostic (it never calls
    // preventDefault itself); the dom surface suppresses the browser's
    // Cmd+D bookmark default via `claims()`. Pin that the row is
    // advertised so the host-side preventDefault actually fires.
    expect(editor.keymap.claims(event)).toBe(true);
    expect(editor.keymap.dispatch(event)).toBe(true);
    expect(editor.serialize().match(/<rect/g)).toHaveLength(2);
  });
});
