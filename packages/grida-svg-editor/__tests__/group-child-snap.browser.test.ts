// Bug 1 — dragging an element INSIDE a translated `<g>` snapped in the
// group's LOCAL frame instead of world space, so the child got spuriously
// snapped to its own parent group (and the guide rendered near the wrong
// place — at the group-local origin rather than where the child actually is).
//
// Why this needs a real browser: the snap input rects used to come from
// `bbox_world`, which projects `getBBox()` through the element's OWN
// `transform=` only and explicitly dropped ancestor `<g transform>`. The
// CORRECT world rect comes from `getCTM()` (the geometry provider's
// `bounds_of`), which folds ancestor transforms in. jsdom returns an identity
// CTM, so the two are indistinguishable there — only a real SVG layout engine
// exposes the gap.
//
// Mechanism of the bug: for a child at local (50,50) under g translate(100,50),
// the world rect is (150,100). When dragged right by 146, the world left edge
// lands at ~296 — far from every snap neighbor, so it must NOT snap. But the
// old code measured the agent in the GROUP-LOCAL frame (left 50+146=196) while
// the only in-scope neighbor — the parent `<g>` — was world-frame (150,100,
// 80,80, center x=190). 196 lands ~6px from 190, so a SPURIOUS snap pulled the
// child to world left ~290.
//
// The fix routes snap rects through the CTM-based geometry provider, so agent
// and neighbors share the world frame. These tests assert the corrected
// behavior; they failed before the fix.

import { describe, it, expect, afterEach } from "vitest";
import {
  attachSurface,
  clientCenter,
  committedWorldRect,
  dragByClient,
  type AttachedSurface,
} from "./_browser-helpers";

// child: local (50,50,80,80) under g translate(100,50) → world (150,100,80,80).
const FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650" viewBox="0 0 900 650"><g id="grp" transform="translate(100,50)"><rect id="child" x="50" y="50" width="80" height="80" fill="#f33"/></g></svg>`;

let surface: AttachedSurface | null = null;

afterEach(() => {
  surface?.dispose();
  surface = null;
  document.body.innerHTML = "";
});

/** Committed world rect of `child`, from the serialized model (so the
 *  assertion does not depend on live re-render timing). */
const committedChildWorldRect = (s: AttachedSurface) =>
  committedWorldRect(s.editor, "child");

describe("bug 1: snap for a child inside a translated group (real DOM)", () => {
  it("sanity: the grouped child renders at its world position", () => {
    surface = attachSurface(FIXTURE);
    const r = surface.worldRectByName("child");
    expect(r).toMatchObject({ x: 150, y: 100, width: 80, height: 80 });
  });

  it("a grouped child lands exactly where dragged — no spurious snap to its own group", () => {
    surface = attachSurface(FIXTURE);
    expect(committedChildWorldRect(surface).x).toBe(150);

    // Drag right by 146 world px. World left edge → ~296, far from every snap
    // neighbor (the parent group's edges are 150 / 190 / 230) → must not snap.
    const center = clientCenter(surface.elementByName("child"));
    dragByClient(surface.container, center, {
      x: center.x + 146,
      y: center.y,
    });

    const after = committedChildWorldRect(surface);
    // CORRECT: lands at the raw dragged position (world left 296).
    // BUG (pre-fix): the group-local agent (left 196) snapped to the parent
    // group's world center (190) and committed to world left ~290.
    expect(after.x).toBeCloseTo(296, 0);
    expect(after.y).toBeCloseTo(100, 0);
  });
});
