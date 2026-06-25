// editor.commands.text_align — real-layout proof.
//
// The headless suite (`text-align.test.ts`) pins the re-anchoring MATH with a
// synthetic provider. This one closes the loop the issue actually cares about:
// against the real SVG layout engine, does swapping a multi-line block's
// anchor keep its rendered bbox put? jsdom reports zero-size text bboxes, so
// only a real browser can measure it. We attach a DOM surface (so the command
// sees the real `getBBox`/`getCTM` geometry) and compare the block's committed
// world rect before vs after — `committedWorldRect` is an independent oracle
// that re-mounts the serialized model rather than trusting the live surface.

import { describe, it, expect, afterEach } from "vitest";
import {
  attachSurface,
  committedWorldRect,
  nodeIdByName,
} from "./_browser-helpers";

// Two flowed lines (no direct text in <text>, so the block bbox is exactly the
// union of the two tspan lines). The lines share the block x and differ in
// width, so re-justification is per-line, not a single block translate.
const DECK = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><text id="t" font-size="24" font-family="sans-serif"><tspan id="l1" x="40" y="50">Hello there world</tspan><tspan id="l2" x="40" y="84">Hi</tspan></text></svg>`;

let surface: ReturnType<typeof attachSurface> | null = null;
afterEach(() => {
  surface?.dispose();
  surface = null;
});

describe("editor.commands.text_align — real SVG layout", () => {
  for (const value of ["middle", "end"] as const) {
    it(`${value}: block bbox is preserved and a single undo restores it`, () => {
      surface = attachSurface(DECK);
      const { editor } = surface;
      const before = committedWorldRect(editor, "t");

      editor.commands.select(nodeIdByName(editor, "t"));
      expect(editor.commands.text_align(value)).toBe(true);

      const after = committedWorldRect(editor, "t");
      // Same glyphs, same size — the union rect must land where it was.
      expect(after.x).toBeCloseTo(before.x, 0);
      expect(after.y).toBeCloseTo(before.y, 0);
      expect(after.width).toBeCloseTo(before.width, 0);
      expect(after.height).toBeCloseTo(before.height, 0);

      // Both lines now anchor on the same vertical (the chosen edge/center).
      expect(editor.document.get_attr(nodeIdByName(editor, "l1"), "x")).toBe(
        editor.document.get_attr(nodeIdByName(editor, "l2"), "x")
      );
      expect(
        editor.document.get_attr(nodeIdByName(editor, "t"), "text-anchor")
      ).toBe(value);

      editor.commands.undo();
      const restored = committedWorldRect(editor, "t");
      expect(restored.x).toBeCloseTo(before.x, 0);
      expect(restored.width).toBeCloseTo(before.width, 0);
      expect(editor.state.can_undo).toBe(false);
    });
  }
});
