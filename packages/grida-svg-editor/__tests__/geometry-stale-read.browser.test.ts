// Flush-on-read: live-DOM geometry reads must never observe (or cache) the
// previous document's layout.
//
// The failure mode this pins (gridaco/grida#795, live-editor follow-up): the
// geometry channel (`subscribe_geometry`) fires synchronously INSIDE a doc
// mutation, before the surface's render listener projects the new attrs into
// the live DOM. A subscriber that reads `editor.geometry.bounds_of(...)` from
// that window — exactly what a `useSyncExternalStore` bounds hook does on its
// snapshot check — used to read `getBBox()` off the stale DOM, and the
// `MemoizedGeometryProvider` cached that rect as current. Every later
// geometry consumer then planned against one-mutation-stale bounds: invoking
// align repeatedly re-applied the PREVIOUS delta each time, so the element
// marched/ping-ponged instead of settling. The fix: `SvgGeometryDriver`
// flushes the pending render (`flush_dom`, revision-gated) before every
// live-DOM read — the same model as CSS layout flushing on `offsetWidth`.
//
// Needs a real layout engine (`getBBox`); jsdom cannot observe this.

import { describe, expect, it } from "vitest";
import type { Rect } from "../src/types";
import { attachSurface, nodeIdByName } from "./_browser-helpers";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
<rect id="A" x="10" y="10" width="20" height="20"/>
<rect id="B" x="50" y="40" width="20" height="20"/>
</svg>`;

/** Mirror of a React `useSyncExternalStore` bounds hook: reads bounds from
 *  inside the geometry channel, where the store-changed check would run.
 *  Returns the log of rects it observed. */
function installPoisonReader(
  editor: ReturnType<typeof attachSurface>["editor"],
  id: string
): Array<Rect | null> {
  const seen: Array<Rect | null> = [];
  editor.subscribe_geometry(() => {
    seen.push(editor.geometry?.bounds_of(id) ?? null);
  });
  return seen;
}

describe("geometry flush-on-read — align stays idempotent under mid-mutation readers", () => {
  it("single-selection align converges; repeat invocations are no-ops", () => {
    const s = attachSurface(SVG);
    try {
      const A = nodeIdByName(s.editor, "A");
      installPoisonReader(s.editor, A);
      s.editor.commands.select(A);

      // Parent is the root <svg> viewport (0 0 200 100); align right puts
      // A's right edge at 200 → x = 180.
      expect(s.editor.commands.align("right")).toBe(true);
      expect(s.editor.document.get_attr(A, "x")).toBe("180");

      // Pre-fix, the mid-mutation read cached A's PREVIOUS bounds, so this
      // second call saw x=10, recomputed the same +170 delta, and marched
      // the rect to x=350. It must refuse (zero delta) and change nothing.
      const settled = s.editor.serialize();
      expect(s.editor.commands.align("right")).toBe(false);
      expect(s.editor.document.get_attr(A, "x")).toBe("180");
      expect(s.editor.serialize()).toBe(settled);
    } finally {
      s.dispose();
    }
  });

  it("multi-selection align settles instead of ping-ponging", () => {
    const s = attachSurface(SVG);
    try {
      const A = nodeIdByName(s.editor, "A");
      const B = nodeIdByName(s.editor, "B");
      installPoisonReader(s.editor, A);
      installPoisonReader(s.editor, B);
      s.editor.commands.select([A, B]);

      // Union x ∈ [10, 70], center 40. A (w=20) → x=30; B → x=30.
      expect(s.editor.commands.align("horizontal_centers")).toBe(true);
      expect(s.editor.document.get_attr(A, "x")).toBe("30");
      expect(s.editor.document.get_attr(B, "x")).toBe("30");

      const settled = s.editor.serialize();
      expect(s.editor.commands.align("horizontal_centers")).toBe(false);
      expect(s.editor.serialize()).toBe(settled);
    } finally {
      s.dispose();
    }
  });

  it("a geometry-channel subscriber observes post-mutation bounds, not the previous layout", () => {
    const s = attachSurface(SVG);
    try {
      const A = nodeIdByName(s.editor, "A");
      const seen = installPoisonReader(s.editor, A);
      s.editor.commands.select(A);
      s.editor.commands.align("right");

      // The reader fired from inside the mutation window. Flush-on-read
      // means it must already see the post-align rect (x=180), never the
      // pre-align x=10 layout.
      expect(seen.length).toBeGreaterThan(0);
      expect(seen[seen.length - 1]?.x).toBe(180);
    } finally {
      s.dispose();
    }
  });
});
