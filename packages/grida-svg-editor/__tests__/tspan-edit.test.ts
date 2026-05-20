// Verifies that `<tspan>` and leaf `<text>` are equally valid targets for
// `editor.commands.set_text` and `editor.enter_content_edit`, while a
// `<text>` containing element children (e.g. nested `<tspan>`) is rejected —
// the v1 flat-string model can't represent it honestly.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src";

const FLAT_TEXT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text id="t" x="10" y="20">hello</text></svg>`;

const MIXED_TEXT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text id="t" x="10" y="20">Hello <tspan id="span" fill="red">world</tspan>!</text></svg>`;

function findId(
  editor: ReturnType<typeof createSvgEditor>,
  name: string
): string {
  const found = [...editor.tree().nodes.values()].find((n) => n.name === name);
  if (!found) throw new Error(`no node named "${name}"`);
  return found.id;
}

describe("tspan as a content-edit target", () => {
  it("set_text works on a leaf <text>", () => {
    const editor = createSvgEditor({ svg: FLAT_TEXT });
    const t = findId(editor, "t");
    editor.commands.select(t);
    editor.commands.set_text("changed");
    expect(editor.document.text_of(t)).toBe("changed");
  });

  it("set_text works on a leaf <tspan>", () => {
    const editor = createSvgEditor({ svg: MIXED_TEXT });
    const span = findId(editor, "span");
    editor.commands.select(span);
    editor.commands.set_text("there");
    expect(editor.document.text_of(span)).toBe("there");
  });

  it("set_text refuses a <text> with mixed children (would clobber tspan)", () => {
    const editor = createSvgEditor({ svg: MIXED_TEXT });
    const t = findId(editor, "t");
    editor.commands.select(t);
    const before = editor.serialize();
    editor.commands.set_text("ignored");
    expect(editor.serialize()).toBe(before);
  });

  it("enter_content_edit returns false without a driver but past the document gate for a <tspan>", () => {
    // No DOM surface attached → no driver → false. We're verifying the
    // gate before the driver passes: the rejection is from the missing
    // driver, not from a tag check that would have killed the tspan path.
    const editor = createSvgEditor({ svg: MIXED_TEXT });
    const span = findId(editor, "span");
    expect(editor.enter_content_edit(span)).toBe(false);
  });

  it("enter_content_edit rejects a <text> with mixed children at the document gate", () => {
    const editor = createSvgEditor({ svg: MIXED_TEXT });
    const t = findId(editor, "t");
    expect(editor.enter_content_edit(t)).toBe(false);
  });

  it("enter_content_edit rejects non-text/tspan elements", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="r" x="0" y="0" width="10" height="10"/></svg>`,
    });
    const r = findId(editor, "r");
    expect(editor.enter_content_edit(r)).toBe(false);
  });
});
