// Model-level coverage for `<tspan>` translation via relative `dx`/`dy`
// (the fix for the "tspan teleports to 0,0" bug). Pure / headless — no DOM
// needed, since this asserts on the serialized attribute model, not layout.
// The browser test (`tspan-translate.browser.test.ts`) covers the rendered
// result; this one pins the attribute composition + faithful revert, including
// the per-glyph offset-list tail that the browser test's simple fixture omits.

import { describe, expect, it } from "vitest";
import { createSvgEditor, type SvgEditor } from "../src";

function svg(textInner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text id="t" x="10" y="20">Hi <tspan id="s">${textInner}</tspan></text></svg>`;
}

function spanId(editor: SvgEditor): string {
  const n = [...editor.tree().nodes.values()].find((n) => n.name === "s");
  if (!n) throw new Error("no node named 's'");
  return n.id;
}

function spanAttrs(editor: SvgEditor): {
  dx: string | null;
  dy: string | null;
} {
  const out = editor.serialize();
  const tag = out.match(/<tspan id="s"[^>]*>/)?.[0] ?? "";
  return {
    dx: tag.match(/\bdx="([^"]*)"/)?.[1] ?? null,
    dy: tag.match(/\bdy="([^"]*)"/)?.[1] ?? null,
  };
}

describe("tspan translate composes relative dx/dy", () => {
  it("a flow tspan gains dx/dy on translate and loses them on undo", () => {
    const editor = createSvgEditor({ svg: svg("world") });
    editor.commands.select(spanId(editor));

    editor.commands.translate({ dx: 7, dy: -3 });
    expect(spanAttrs(editor)).toEqual({ dx: "7", dy: "-3" });

    editor.commands.undo();
    // Faithful revert: the attributes are removed, not left as dx="0".
    expect(spanAttrs(editor)).toEqual({ dx: null, dy: null });
  });

  it("preserves a per-glyph dx/dy tail, shifting only the leading value", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text id="t" x="10" y="20"><tspan id="s" dx="5 1 2" dy="3">abc</tspan></text></svg>`,
    });
    editor.commands.select(spanId(editor));

    editor.commands.translate({ dx: 4, dy: 6 });
    // Leading offset shifts (5→9, 3→9); the kerning tail "1 2" is untouched.
    expect(spanAttrs(editor)).toEqual({ dx: "9 1 2", dy: "9" });

    editor.commands.undo();
    expect(spanAttrs(editor)).toEqual({ dx: "5 1 2", dy: "3" });
  });
});
