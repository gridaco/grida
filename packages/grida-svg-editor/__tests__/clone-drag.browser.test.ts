// Alt-drag translate-with-clone through the REAL DOM surface — pins the
// dom.ts wiring that the headless clone-drag suite cannot see:
// `current_translate_modifiers` mapping `hud.modifiers().alt` → the
// orchestrator's clone signal, `sync_modifiers` re-driving the translate
// orchestrator on an Alt flip BETWEEN pointer moves, and the
// `set_selection` dep retargeting the editor selection to the clones.
// Deleting any of those wires keeps every headless test green; this
// suite is the drift guard. (Spec: docs/wg/feat-svg-editor/subtree-clone.md;
// gridaco/grida#817.)

import { describe, expect, it } from "vitest";
import {
  attachSurface,
  clientCenter,
  nodeIdByName,
  pointer,
} from "./_browser-helpers";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300"><rect id="a" x="10" y="10" width="20" height="20" fill="red"/></svg>`;

function altKey(win: Window, type: "keydown" | "keyup", held: boolean): void {
  win.dispatchEvent(
    new KeyboardEvent(type, {
      key: "Alt",
      code: "AltLeft",
      altKey: held,
      bubbles: true,
      cancelable: true,
    })
  );
}

const rect_count = (serialized: string) =>
  serialized.match(/<rect/g)?.length ?? 0;

describe("alt-drag clone via the DOM surface", () => {
  it("Alt pressed mid-drag clones on the key flip (redrive), commits as ONE undo step", () => {
    const s = attachSurface(SVG);
    try {
      const baseline = s.editor.serialize();
      const a = nodeIdByName(s.editor, "a");
      s.editor.commands.select([a]);
      const from = clientCenter(s.elementByName("a"));
      const win = s.container.ownerDocument.defaultView!;

      pointer(s.container, "pointerdown", from.x, from.y, 1);
      pointer(win, "pointermove", from.x + 6, from.y + 4, 1);

      // The flip itself must clone — NO pointer move in between. This is
      // the sync_modifiers → redrive_modifiers wire.
      altKey(win, "keydown", true);
      expect(rect_count(s.editor.serialize())).toBe(2);
      expect(s.editor.document.get_attr(a, "x")).toBe("10"); // origin at rest

      // Subsequent pointer events carry the held key, as real ones do —
      // the surface mirrors pointer-event mods into the same store.
      pointer(win, "pointermove", from.x + 60, from.y + 40, 1, {
        altKey: true,
      });
      pointer(win, "pointerup", from.x + 60, from.y + 40, 0, { altKey: true });
      altKey(win, "keyup", false);

      expect(rect_count(s.editor.serialize())).toBe(2);
      expect(s.editor.document.get_attr(a, "x")).toBe("10");
      // Selection followed the clone (set_selection dep), and the clone
      // carries the full displacement.
      const [clone] = s.editor.state.selection;
      expect(clone).not.toBe(a);
      expect(s.editor.document.get_attr(clone, "x")).toBe("70");
      expect(s.editor.document.get_attr(clone, "y")).toBe("50");

      // ONE undo removes clone + move together, byte-exact.
      s.editor.commands.undo();
      expect(s.editor.serialize()).toBe(baseline);
      expect(s.editor.state.can_undo).toBe(false);
    } finally {
      s.dispose();
    }
  });

  it("Alt released mid-drag removes the clone; the origin resumes and commits a plain move", () => {
    const s = attachSurface(SVG);
    try {
      const a = nodeIdByName(s.editor, "a");
      s.editor.commands.select([a]);
      const from = clientCenter(s.elementByName("a"));
      const win = s.container.ownerDocument.defaultView!;

      pointer(s.container, "pointerdown", from.x, from.y, 1);
      pointer(win, "pointermove", from.x + 6, from.y + 4, 1);
      altKey(win, "keydown", true);
      expect(rect_count(s.editor.serialize())).toBe(2);

      altKey(win, "keyup", false);
      expect(rect_count(s.editor.serialize())).toBe(1); // clone gone on the flip

      pointer(win, "pointermove", from.x + 30, from.y, 1);
      pointer(win, "pointerup", from.x + 30, from.y, 0);

      expect(rect_count(s.editor.serialize())).toBe(1);
      expect(s.editor.document.get_attr(a, "x")).toBe("40"); // plain move
    } finally {
      s.dispose();
    }
  });
});
