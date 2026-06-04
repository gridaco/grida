// Bug 2 — translating a `<tspan>` with no explicit x/y jumps it to absolute
// (≈0,0) instead of moving it by the drag delta, and undo fails to restore it.
//
// Why this needs a real browser: the truth here is the *rendered* position of
// the tspan, which depends on text flow (the tspan inherits its baseline from
// the parent `<text>`). jsdom reports zero-size text bboxes, so the layout
// regression is invisible in the node test suite. Here we serialize the
// editor's model after each step and measure the real SVG layout.
//
// Etiology (see core/translate-pipeline/translate-pipeline.ts):
//   - capture_baseline reads absent tspan x/y as 0
//   - apply writes x = 0 + dx, y = 0 + dy  → absolute jump to (dx, dy)
//   - revert writes x="0", y="0"           → undo lands at (0,0), not restored
//
// These tests assert the CORRECT behavior and therefore FAIL on current code,
// capturing the bug.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSvgEditor, type SvgEditor } from "../src";
import { committedWorldRect, nodeIdByName } from "./_browser-helpers";

// A tspan that flows after "Hello " on the parent text's baseline (y=80).
// It has NO explicit x/y — its position comes from text layout, which is
// exactly the case the translate pipeline mishandles.
const FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><text id="t" x="40" y="80" font-size="20" font-family="sans-serif">Hello <tspan id="span">world</tspan></text></svg>`;

/** World rect of the tspan, from the editor's current serialized model. */
const measureSpan = (editor: SvgEditor) => committedWorldRect(editor, "span");

describe("bug 2: tspan translate (real DOM layout)", () => {
  let editor: SvgEditor;

  beforeEach(() => {
    document.body.innerHTML = "";
    editor = createSvgEditor({ svg: FIXTURE });
  });

  afterEach(() => {
    editor.dispose();
    document.body.innerHTML = "";
  });

  it("the tspan starts flowed after 'Hello ' (not at the origin)", () => {
    const r = measureSpan(editor);
    // Sanity: the flowed tspan sits to the right of the text x (40) and on
    // the baseline near y=80 — nowhere near (0,0). This anchors the later
    // delta assertions.
    expect(r.x).toBeGreaterThan(60);
    expect(r.y).toBeGreaterThan(40);
  });

  it("translating by (0, +10) moves the tspan down 10 — not to absolute 0,0", () => {
    const before = measureSpan(editor);

    const span = nodeIdByName(editor, "span");
    editor.commands.select(span);
    editor.commands.translate({ dx: 0, dy: 10 });

    const after = measureSpan(editor);

    // Correct: pure vertical move by the delta, horizontal unchanged.
    expect(after.y - before.y).toBeCloseTo(10, 1);
    expect(after.x - before.x).toBeCloseTo(0, 1);
  });

  it("undo restores the tspan to its original flowed position", () => {
    const before = measureSpan(editor);

    const span = nodeIdByName(editor, "span");
    editor.commands.select(span);
    editor.commands.translate({ dx: 0, dy: 10 });
    editor.commands.undo();

    const after = measureSpan(editor);

    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });
});
