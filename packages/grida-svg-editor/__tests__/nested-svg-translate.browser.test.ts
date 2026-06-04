// Bug 3 — a child INSIDE a nested `<svg>` viewport that scales its user
// space gets translated by the WRONG amount: the pipeline writes the
// world-space drag delta straight into the child's local `x`/`y`, but those
// attributes live in the inner viewport's user space. When the inner
// viewport scales (e.g. width=240 over viewBox 0…120 → 2×), the child moves
// `scale ×` too far on screen — a +100px drag lands +200px ("2× accumulated").
//
// Why this needs a real browser: the bug is a coordinate-frame error between
// world space and the inner viewport's user space. jsdom returns an identity
// CTM, so world ≡ local there and the scale gap is invisible. Only a real SVG
// layout engine exposes it via getBBox + getCTM.
//
// inner: x=100 y=50 width=240 height=170 viewBox="0 0 120 85" → 2× scale.
// child: local (20,20,40,40) → world (100+20·2, 50+20·2, 40·2, 40·2)
//        = (140, 90, 80, 80).
import { describe, it, expect, afterEach } from "vitest";
import {
  attachSurface,
  clientCenter,
  committedWorldRect,
  dragByClient,
  type AttachedSurface,
} from "./_browser-helpers";

const FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650" viewBox="0 0 900 650"><svg id="inner" x="100" y="50" width="240" height="170" viewBox="0 0 120 85"><rect id="child" x="20" y="20" width="40" height="40" fill="#f33"/></svg></svg>`;

let surface: AttachedSurface | null = null;

afterEach(() => {
  surface?.dispose();
  surface = null;
  document.body.innerHTML = "";
});

const committedChildWorldRect = (s: AttachedSurface) =>
  committedWorldRect(s.editor, "child");

describe("bug 3: translate a child inside a scaled nested <svg> (real DOM)", () => {
  it("sanity: the nested child renders at its world position", () => {
    surface = attachSurface(FIXTURE);
    const r = surface.worldRectByName("child");
    expect(r).toMatchObject({ x: 140, y: 90, width: 80, height: 80 });
  });

  it("a +100px world drag moves the child +100px in world space — not 2×", () => {
    surface = attachSurface(FIXTURE);
    // Snap off: this asserts the translate-projection fix in isolation.
    // World-space bounds for a NESTED `<svg>` element are a separate, known
    // v1 limitation (`svg_viewport_bounds` reports the inner viewBox, not
    // the projected world rect), so leaving snap on would let the child
    // spuriously snap to the inner viewport's mis-framed edges. That bug is
    // tracked independently of the doubling fix under test here.
    surface.editor.set_style({ snap_enabled: false });
    expect(committedChildWorldRect(surface).x).toBeCloseTo(140, 0);

    const center = clientCenter(surface.elementByName("child"));
    dragByClient(surface.container, center, { x: center.x + 100, y: center.y });

    const after = committedChildWorldRect(surface);
    // CORRECT: world left 140 → 240 (the drag distance, exactly).
    // BUG: the world delta (100) is written to the local frame and re-scaled
    // by 2×, landing the child at world left 340.
    expect(after.x).toBeCloseTo(240, 0);
    expect(after.y).toBeCloseTo(90, 0);
  });
});
