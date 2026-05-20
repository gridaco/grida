// Shared test helpers. Keep small and obvious — anything that needs
// arguments or branching belongs in the test file itself.

import type { createSvgEditor } from "../src/index";
import type { SvgDocument } from "../src/core/document";
import type { Rect } from "../src/types";

/** Synthetic `Rect` literal — for headless snap / cmath fixtures that
 *  don't need a real SVG layout. */
export function rect(x: number, y: number, w = 10, h = 10): Rect {
  return { x, y, width: w, height: h };
}

/** Id of the first `<rect>` in document order. Two overloads so tests
 *  can pass either the editor (most common) or the bare document. */
export function first_rect(editor: ReturnType<typeof createSvgEditor>): string;
export function first_rect(doc: SvgDocument): string;
export function first_rect(
  source: ReturnType<typeof createSvgEditor> | SvgDocument
): string {
  // Editor surface has `.tree()`; SvgDocument has `.all_elements()` + `.tag_of()`.
  if ("tree" in source) {
    for (const [id, n] of source.tree().nodes) {
      if (n.tag === "rect") return id;
    }
  } else {
    for (const id of source.all_elements()) {
      if (source.tag_of(id) === "rect") return id;
    }
  }
  throw new Error("no <rect> in document");
}
