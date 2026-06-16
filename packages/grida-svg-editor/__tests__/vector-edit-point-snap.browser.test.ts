// End-to-end proof for point-level geometry snapping (gridaco/grida#844):
// dragging a path vertex — or a `<line>` endpoint — snaps to the same
// element's other points (x/y align + land-on-point), honoring the global
// snap toggle + threshold. Keyboard nudge is exempt (moves the exact step).
//
// Driven through the real surface in headless Chromium so `getScreenCTM` is
// the actual layout engine. The surface is mounted at the document origin
// under an identity camera, so client px == world == SVG user units (see
// `attachSurface`) and the default 6px snap threshold is 6 units here. A
// path of straight `L` segments keeps the committed `d` a clean vertex list
// we can read back by extracting the numbers in order.

import { afterEach, describe, expect, it } from "vitest";
import {
  attachSurface,
  nodeIdByName,
  pointer,
  type AttachedSurface,
} from "./_browser-helpers";

// v0 (100,100) · v1 (300,100) · v2 (300,300). v1 and v2 share x=300, so a
// vertex dragged near that column has two snap anchors to align against.
const PATH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <path id="p" d="M 100 100 L 300 100 L 300 300" fill="none" stroke="#222"/>
</svg>`;

let s: AttachedSurface | null = null;
afterEach(() => {
  s?.dispose();
  s = null;
});

/** Vertex coordinates of the committed `d`, in order — straight `L`s with
 *  zero tangents, so the path data is just the vertex list. */
function vertices(a: AttachedSurface): Array<[number, number]> {
  const d = a.editor.document.get_attr(nodeIdByName(a.editor, "p"), "d") ?? "";
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

function enterPathEdit(a: AttachedSurface): void {
  const id = nodeIdByName(a.editor, "p");
  a.editor.commands.select(id);
  a.editor.enter_content_edit(id);
  expect(a.editor.state.mode).toBe("edit-content");
}

/** Drag a control from one client point to another: down, a promote move,
 *  the destination move, then up. Mirrors the real gesture sequence the HUD
 *  needs to lift "pending" → an active vertex/endpoint translate. */
function drag(
  a: AttachedSurface,
  from: [number, number],
  to: [number, number]
): void {
  const win = a.container.ownerDocument.defaultView!;
  pointer(a.container, "pointerdown", from[0], from[1], 1);
  pointer(win, "pointermove", (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 1);
  pointer(win, "pointermove", to[0], to[1], 1);
  pointer(win, "pointerup", to[0], to[1], 0);
}

/** Tap (down+up, no drag) — selects whatever control is under the cursor. */
function tap(a: AttachedSurface, x: number, y: number): void {
  const win = a.container.ownerDocument.defaultView!;
  pointer(a.container, "pointerdown", x, y, 1);
  pointer(win, "pointerup", x, y, 0);
}

function arrow(a: AttachedSurface, code: string, shiftKey = false): boolean {
  return a.editor.keymap.dispatch({
    code,
    metaKey: false,
    ctrlKey: false,
    shiftKey,
    altKey: false,
    preventDefault: () => {},
  } as unknown as KeyboardEvent);
}

describe("#844 — point snap for path vertices", () => {
  it("aligns a dragged vertex to a neighbor's x when within threshold", () => {
    s = attachSurface(PATH);
    enterPathEdit(s);

    // Drag v0 to (296,200): x=296 is 4px from the x=300 column (v1/v2),
    // within the 6px threshold ⇒ x snaps to 300. y=200 has no anchor near.
    drag(s, [100, 100], [296, 200]);

    const v = vertices(s);
    expect(v[0][0]).toBeCloseTo(300, 3); // x snapped onto the column
    expect(v[0][1]).toBeCloseTo(200, 3); // y free — followed the cursor
    expect(v[1]).toEqual([300, 100]); // neighbors untouched
    expect(v[2]).toEqual([300, 300]);
  });

  it("lands a dragged vertex exactly on a neighbor point when close on both axes", () => {
    s = attachSurface(PATH);
    enterPathEdit(s);

    // Drag v0 toward v1 (300,100): final (297,103) is within 6px on x AND y.
    drag(s, [100, 100], [297, 103]);

    const v = vertices(s);
    expect(v[0][0]).toBeCloseTo(300, 3); // landed on v1.x
    expect(v[0][1]).toBeCloseTo(100, 3); // landed on v1.y
  });

  it("does not snap when the global snap toggle is off", () => {
    s = attachSurface(PATH);
    s.editor.set_style({ snap_enabled: false });
    enterPathEdit(s);

    // Same drag as the x-align case — with snap off the vertex goes exactly
    // where the cursor goes (free point dragging, per the issue).
    drag(s, [100, 100], [296, 200]);

    const v = vertices(s);
    expect(v[0][0]).toBeCloseTo(296, 3);
    expect(v[0][1]).toBeCloseTo(200, 3);
  });

  it("selecting a vertex within threshold of a neighbor does not move it", () => {
    // v0 rests at (296,200) — 4px from the x=300 column, inside the 6px
    // threshold. Snap is position-based, so without a movement guard a bare
    // tap (select) would jump it onto the column. Clicking must not relocate.
    s = attachSurface(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
        <path id="p" d="M 296 200 L 300 100 L 300 300" fill="none" stroke="#222"/>
      </svg>`
    );
    enterPathEdit(s);
    tap(s, 296, 200); // select v0
    expect(vertices(s)[0]).toEqual([296, 200]); // unmoved by selection
  });

  it("a keyboard nudge moves the exact step and never snaps onto a neighbor", () => {
    // v0 starts at (296,200) — one ArrowRight takes it to 297, which is
    // within 6px of the x=300 column. A drag would snap to 300; a nudge must
    // not (it moves by exactly 1px).
    s = attachSurface(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
        <path id="p" d="M 296 200 L 300 100 L 300 300" fill="none" stroke="#222"/>
      </svg>`
    );
    enterPathEdit(s);
    tap(s, 296, 200); // select v0

    expect(arrow(s, "ArrowRight")).toBe(true);

    const v = vertices(s);
    expect(v[0][0]).toBeCloseTo(297, 3); // exact +1, NOT snapped to 300
    expect(v[0][1]).toBeCloseTo(200, 3);
  });
});

describe("#844 — point snap for <line> endpoints", () => {
  it("snaps a dragged endpoint onto the opposite endpoint's axis (stays orthogonal)", () => {
    // p1 (100,100) · p2 (300,150). Drag p2 to (350,103): y=103 is 3px from
    // p1's y=100 ⇒ y snaps to 100, leaving a horizontal line. x is far from
    // p1's x=100, so it follows the cursor.
    s = attachSurface(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
        <line id="ln" x1="100" y1="100" x2="300" y2="150" stroke="#222"/>
      </svg>`
    );
    const id = nodeIdByName(s.editor, "ln");
    s.editor.commands.select(id);
    s.editor.enter_content_edit(id);
    expect(s.editor.state.mode).toBe("edit-content");

    drag(s, [300, 150], [350, 103]);

    const num = (n: string) =>
      Number(s!.editor.document.get_attr(id, n) ?? "NaN");
    expect(num("x1")).toBeCloseTo(100, 3); // p1 untouched
    expect(num("y1")).toBeCloseTo(100, 3);
    expect(num("x2")).toBeCloseTo(350, 3); // p2 x followed the cursor
    expect(num("y2")).toBeCloseTo(100, 3); // p2 y snapped onto p1's row
  });
});

describe("#844 — axis-lock + snap compose like the translate pipeline", () => {
  it("a Shift-locked mostly-vertical drag is not flipped horizontal by an x-snap", () => {
    // v0 (300,100), v1 (310,200). Drag v0 by (dx=4, dy=8) with Shift — the
    // user's intent is vertical (|dy| > |dx|). Locking AFTER snap would let an
    // x correction toward v1's column grow dx past dy and flip the lock to
    // horizontal; locking the RAW delta BEFORE snap (translate-pipeline order
    // `axis_lock → snap`) keeps dominance the user's intent. (gridaco/grida#844
    // review.)
    s = attachSurface(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
        <path id="p" d="M 300 100 L 310 200" fill="none" stroke="#222"/>
      </svg>`
    );
    enterPathEdit(s);
    const win = s.container.ownerDocument.defaultView!;
    const shift = { shiftKey: true };
    pointer(s.container, "pointerdown", 300, 100, 1, shift);
    pointer(win, "pointermove", 302, 104, 1, shift);
    pointer(win, "pointermove", 304, 108, 1, shift);
    pointer(win, "pointerup", 304, 108, 0, shift);

    const v = vertices(s);
    expect(v[0][0]).toBeCloseTo(300, 3); // x stayed locked — not flipped
    expect(v[0][1]).toBeCloseTo(108, 3); // moved along the dominant (y) axis
  });

  it("snap threshold stays screen pixels under a non-uniform element transform", () => {
    // transform="scale(2 1)" → 1 local x-unit = 2 screen px, 1 local y = 1px.
    // v0 local (100,100) → screen (200,100); v1 local (100,300) → screen
    // (200,300). Drag v0 7px right on screen — that's only 3.5 local x, which a
    // single area-scale threshold (÷√2 ≈ 4.24 local) would treat as in-range
    // and snap back onto v1's column. A screen-pixel threshold sees 7px > 6px
    // and leaves it free. (gridaco/grida#844 review.)
    s = attachSurface(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
        <path id="p" transform="scale(2 1)" d="M 100 100 L 100 300" fill="none" stroke="#222"/>
      </svg>`
    );
    enterPathEdit(s);
    const win = s.container.ownerDocument.defaultView!;
    pointer(s.container, "pointerdown", 200, 100, 1);
    pointer(win, "pointermove", 203.5, 100, 1);
    pointer(win, "pointermove", 207, 100, 1);
    pointer(win, "pointerup", 207, 100, 0);

    const v = vertices(s);
    expect(v[0][0]).toBeCloseTo(103.5, 1); // 7 screen px ÷ 2 = 3.5 local; NOT snapped to 100
    expect(v[0][1]).toBeCloseTo(100, 3);
  });

  it("a Shift+Arrow nudge moves the exact screen step on a skewed path (no axis-lock collapse)", () => {
    // skewX(30): screen_x = local_x + tan(30)·local_y, screen_y = local_y.
    // v0 local (100,100) → screen (157.7,100). Shift+ArrowDown nudges 10px DOWN
    // ON SCREEN; projecting that screen step to local yields a delta with BOTH
    // components (−tan30·10, 10). Locking the projected-local delta (the old
    // order) would collapse the x part and move the point wrong; locking the
    // RAW single-axis screen delta first is a no-op, so the nudge is exact.
    // (gridaco/grida#844 review.)
    const TAN30 = Math.tan(Math.PI / 6); // ≈ 0.5773
    s = attachSurface(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
        <path id="p" transform="skewX(30)" d="M 100 100 L 200 300" fill="none" stroke="#222"/>
      </svg>`
    );
    enterPathEdit(s);
    tap(s, 100 + TAN30 * 100, 100); // select v0 at its screen position

    expect(arrow(s, "ArrowDown", true)).toBe(true); // Shift ⇒ 10px step

    const v = vertices(s);
    expect(v[0][0]).toBeCloseTo(100 - TAN30 * 10, 1); // x compensates ≈ 94.23
    expect(v[0][1]).toBeCloseTo(110, 3); // y + 10 (exact screen-down step)
  });
});
