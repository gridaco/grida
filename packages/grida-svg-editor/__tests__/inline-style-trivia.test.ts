// Editor-level wiring for inline-style editing (issue #823).
//
// The trivia-preserving declaration grammar itself is owned and spec'd by
// `@grida/svg` (`inline_style`, see its `parse/__tests__/inline-style.test.ts`).
// These tests only prove the editor plumbs the `style` attribute through it:
// `set_style` writes a minimal diff into the document, `get_style` /
// `get_all_styles` read it back, and a non-style edit leaves the authored
// `style` bytes verbatim (the README's P1 letter).

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import { first_rect } from "./_helpers";

function editorWith(style: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" style="${style}"/></svg>`;
  const editor = createSvgEditor({ svg });
  return { editor, id: first_rect(editor) };
}

describe("editor inline-style wiring (#823)", () => {
  it("set_style writes a minimal diff and the document round-trips byte-equal", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" style="fill:red;stroke:blue"/></svg>`;
    const editor = createSvgEditor({ svg: src });
    editor.document.set_style(first_rect(editor), "fill", "green");
    expect(editor.serialize()).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" style="fill:green;stroke:blue"/></svg>`
    );
  });

  it("get_style / get_all_styles read the authored declarations back", () => {
    const { editor, id } = editorWith("fill: red ; stroke:blue");
    expect(editor.document.get_style(id, "stroke")).toBe("blue");
    expect(editor.document.get_all_styles(id)).toEqual([
      { property: "fill", value: "red" },
      { property: "stroke", value: "blue" },
    ]);
  });

  it("removing the last declaration drops the style attribute", () => {
    const { editor, id } = editorWith("fill:red");
    editor.document.set_style(id, "fill", null);
    expect(editor.document.get_attr(id, "style")).toBe(null);
  });

  it("a non-style edit leaves authored style bytes verbatim (P1 letter)", () => {
    const { editor, id } = editorWith("fill: red ; stroke: blue;");
    editor.document.set_attr(id, "width", "20");
    expect(editor.document.get_attr(id, "style")).toBe(
      "fill: red ; stroke: blue;"
    );
  });
});
