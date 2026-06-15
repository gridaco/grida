// End-to-end proof that the scene marquee selects LIVE while dragging —
// the selection updates on every preview frame, not only on pointer-up.
// Runs in real headless Chromium so `getBBox` / `getScreenCTM` reflect the
// actual layout the surface snapshots at gesture start, and the gesture
// runs through the real HUD → intent → surface path (no shortcut API).
//
// This is the scene analog of the vector marquee, which already publishes
// its sub-selection per move (see `handle_marquee_vectors`).

import { afterEach, describe, expect, it } from "vitest";
import {
  attachSurface,
  nodeIdByName,
  pointer,
  type AttachedSurface,
} from "./_browser-helpers";

// Two small boxes with empty canvas around them — no full-bleed background,
// so a drag that STARTS at (40,40) begins a marquee (not an element drag).
// Identity camera + origin mount ⇒ client px == world == SVG user units.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <rect id="box1" x="100" y="100" width="80" height="80" fill="#39f"/>
  <rect id="box2" x="300" y="100" width="80" height="80" fill="#f63"/>
</svg>`;

let s: AttachedSurface | null = null;
afterEach(() => {
  s?.dispose();
  s = null;
});

const ids = (a: AttachedSurface, ...names: string[]) =>
  names.map((n) => nodeIdByName(a.editor, n));

describe("scene marquee selects live during the drag", () => {
  it("grows and shrinks the selection per preview frame, before release", () => {
    s = attachSurface(SVG);
    const win = s.container.ownerDocument.defaultView!;

    // Down on empty canvas, then cross the drag threshold — rect (40,40)→
    // (70,70) covers neither box.
    pointer(s.container, "pointerdown", 40, 40, 1);
    pointer(win, "pointermove", 70, 70, 1);
    expect(s.editor.state.selection).toEqual([]);

    // Grow to cover box1 — asserted on the PREVIEW frame, before pointerup.
    pointer(win, "pointermove", 200, 200, 1);
    expect(s.editor.state.selection).toEqual(ids(s, "box1"));

    // Grow to cover both boxes — still live.
    pointer(win, "pointermove", 420, 300, 1);
    expect(s.editor.state.selection).toEqual(ids(s, "box1", "box2"));

    // Shrink back over box1 only — box2 is released live, not stranded.
    pointer(win, "pointermove", 200, 200, 1);
    expect(s.editor.state.selection).toEqual(ids(s, "box1"));

    // Commit matches the last preview.
    pointer(win, "pointerup", 200, 200, 0);
    expect(s.editor.state.selection).toEqual(ids(s, "box1"));
  });

  it("Shift unions live against the gesture-start selection, releasing on shrink", () => {
    s = attachSurface(SVG);
    const win = s.container.ownerDocument.defaultView!;
    // Held Shift on every frame: an additive marquee preserves the prior
    // selection on pointer-down (a plain marquee would deselect it first),
    // so box2 is a real baseline to union against.
    const shift = { shiftKey: true };

    // Pre-select box2 — the additive baseline.
    s.editor.commands.select(nodeIdByName(s.editor, "box2"));

    pointer(s.container, "pointerdown", 40, 40, 1, shift);
    pointer(win, "pointermove", 200, 200, 1, shift); // covers box1
    // box1 is ADDED to box2 (baseline first), live — not a replace.
    expect(s.editor.state.selection).toEqual(ids(s, "box2", "box1"));

    // Grow to also cover box2's own box — no duplicate of the baseline member.
    pointer(win, "pointermove", 420, 300, 1, shift);
    expect(s.editor.state.selection).toEqual(ids(s, "box2", "box1"));

    // Shrink so the rect covers nothing: box1 (added by the rect) is released,
    // but the gesture-start baseline box2 stays — additive never drops it.
    pointer(win, "pointermove", 90, 90, 1, shift);
    expect(s.editor.state.selection).toEqual(ids(s, "box2"));

    // Commit while covering box1 again.
    pointer(win, "pointermove", 200, 200, 1, shift);
    pointer(win, "pointerup", 200, 200, 0, shift);
    expect(s.editor.state.selection).toEqual(ids(s, "box2", "box1"));
  });
});
