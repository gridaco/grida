// Live, end-to-end proof of the marquee shadow rule through the WIRED
// surface — real headless Chromium, real getBBox, the real gesture → HUD →
// `marquee_selection.resolve` path (not the math in isolation).
//
// A is a big rect; B is smaller and painted on top, geometrically inside A.
// To begin a marquee INSIDE A (a pickable element) the drag is started with
// meta (cmd) held — meta routes the drag to a marquee instead of a translate.
// meta is gesture-routing ONLY: the selection is still resolved by the shadow
// rule (deterministic in marquee rect + gesture-start selection + shift), so
// cmd-drag shows the shadow behaviour, not a raw "select everything".

import { afterEach, describe, expect, it } from "vitest";
import {
  attachSurface,
  nodeIdByName,
  pointer,
  type AttachedSurface,
} from "./_browser-helpers";

// Identity camera + origin mount ⇒ client px == world == SVG user units.
// A: 0..200. B: 60..100, painted after A so it is in front.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
  <rect id="A" x="0" y="0" width="200" height="200" fill="#ddd"/>
  <rect id="B" x="60" y="60" width="40" height="40" fill="#39f"/>
</svg>`;

let s: AttachedSurface | null = null;
afterEach(() => {
  s?.dispose();
  s = null;
});

const ids = (a: AttachedSurface, ...names: string[]) =>
  names.map((n) => nodeIdByName(a.editor, n));

describe("scene marquee shadow rule, live through the surface (A contains B)", () => {
  it("cmd-drag: start inside A selects A · entering B selects only B · escaping A selects A and B", () => {
    s = attachSurface(SVG);
    const win = s.container.ownerDocument.defaultView!;
    const meta = { metaKey: true }; // cmd held → marquee, even over A

    // Begin the marquee at 20,20 — inside A, not a translate (meta).
    pointer(s.container, "pointerdown", 20, 20, 1, meta);

    // Dragged to 40,40: rect 20..40 sits inside A, away from B → A.
    pointer(win, "pointermove", 40, 40, 1, meta);
    expect(s.editor.state.selection).toEqual(ids(s, "A"));

    // Dragged to 80,80: rect 20..80 still inside A but now crosses B → only
    // B (A contains the rect, so it is shadowed by the front element).
    pointer(win, "pointermove", 80, 80, 1, meta);
    expect(s.editor.state.selection).toEqual(ids(s, "B"));

    // Dragged to 250,250: rect 20..250 reaches past A's 200 edge → A no
    // longer contains it → A is a normal hit again; B still crossed.
    pointer(win, "pointermove", 250, 250, 1, meta);
    expect(s.editor.state.selection).toEqual(ids(s, "A", "B"));

    pointer(win, "pointerup", 250, 250, 0, meta);
    expect(s.editor.state.selection).toEqual(ids(s, "A", "B"));
  });
});
