// `commands.set_opacity` + the `selection.set_opacity` registry command.
//
// Typed, clamped sugar over `set_property("opacity", …)`: one atomic history
// step across the whole selection, clamped to [0,1], no-op on a non-finite
// value or an empty selection. The digit → opacity keybindings are
// deliberately NOT shipped (issue #850), so there is no keymap row to
// exercise here — the registry command is driven via `invoke`.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import { id_of } from "./_helpers";

const TWO_RECTS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10" fill="red"/><rect id="b" x="20" y="0" width="10" height="10" fill="blue"/></svg>`;

describe("commands.set_opacity", () => {
  it("writes opacity across the whole selection in one history step", () => {
    const editor = createSvgEditor({ svg: TWO_RECTS });
    const a = id_of(editor, "a");
    const b = id_of(editor, "b");
    editor.commands.select([a, b]);

    editor.commands.set_opacity(0.5);
    expect(editor.document.get_attr(a, "opacity")).toBe("0.5");
    expect(editor.document.get_attr(b, "opacity")).toBe("0.5");
    expect(editor.state.can_undo).toBe(true);

    // One step: a single undo reverts BOTH members.
    editor.commands.undo();
    expect(editor.document.get_attr(a, "opacity")).toBe(null);
    expect(editor.document.get_attr(b, "opacity")).toBe(null);
    editor.commands.redo();
    expect(editor.document.get_attr(a, "opacity")).toBe("0.5");
    expect(editor.document.get_attr(b, "opacity")).toBe("0.5");
  });

  it("reads back as a typed number via node_properties", () => {
    const editor = createSvgEditor({ svg: TWO_RECTS });
    const a = id_of(editor, "a");
    editor.commands.select(a);
    editor.commands.set_opacity(0.3);
    expect(editor.node_properties(a, ["opacity"]).opacity.computed).toBe(0.3);
  });

  it("emits compact strings for the digit-shortcut values (1 and 0)", () => {
    const editor = createSvgEditor({ svg: TWO_RECTS });
    const a = id_of(editor, "a");
    editor.commands.select(a);
    editor.commands.set_opacity(1);
    expect(editor.document.get_attr(a, "opacity")).toBe("1");
    editor.commands.set_opacity(0);
    expect(editor.document.get_attr(a, "opacity")).toBe("0");
  });

  it("clamps out-of-range values to [0, 1]", () => {
    const editor = createSvgEditor({ svg: TWO_RECTS });
    const a = id_of(editor, "a");
    editor.commands.select(a);
    editor.commands.set_opacity(5);
    expect(editor.document.get_attr(a, "opacity")).toBe("1");
    editor.commands.set_opacity(-3);
    expect(editor.document.get_attr(a, "opacity")).toBe("0");
  });

  it("is a no-op on a non-finite value (no write, no history)", () => {
    const editor = createSvgEditor({ svg: TWO_RECTS });
    const a = id_of(editor, "a");
    editor.commands.select(a);
    editor.commands.set_opacity(Number.NaN);
    expect(editor.document.get_attr(a, "opacity")).toBe(null);
    expect(editor.state.can_undo).toBe(false);
  });

  it("is a no-op on an empty selection (no history)", () => {
    const editor = createSvgEditor({ svg: TWO_RECTS });
    expect(editor.state.selection).toEqual([]);
    editor.commands.set_opacity(0.5);
    expect(editor.document.get_attr(id_of(editor, "a"), "opacity")).toBe(null);
    expect(editor.state.can_undo).toBe(false);
  });

  it("writes inline style when style is the winning carrier (P1)", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"><rect id="a" x="0" y="0" width="10" height="10" style="opacity: 0.2"/></svg>`,
    });
    const a = id_of(editor, "a");
    editor.commands.select(a);
    editor.commands.set_opacity(0.8);
    // The inline style carrier wins the cascade, so the write lands there
    // rather than as a presentation attribute.
    expect(editor.document.get_style(a, "opacity")).toBe("0.8");
    expect(editor.document.get_attr(a, "opacity")).toBe(null);
  });
});

describe("selection.set_opacity (registry command)", () => {
  it("consumes when something is selected and applies the value", () => {
    const editor = createSvgEditor({ svg: TWO_RECTS });
    const a = id_of(editor, "a");
    editor.commands.select(a);
    expect(editor.commands.invoke("selection.set_opacity", 0.4)).toBe(true);
    expect(editor.document.get_attr(a, "opacity")).toBe("0.4");
  });

  it("falls through (returns false) on an empty selection", () => {
    const editor = createSvgEditor({ svg: TWO_RECTS });
    expect(editor.commands.invoke("selection.set_opacity", 0.4)).toBe(false);
  });
});
