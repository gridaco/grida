// End-to-end proof for two point-level path-edit affordances, driven
// through the real surface in headless Chromium (so getScreenCTM is the
// actual layout engine, not jsdom's identity):
//
//   - gridaco/grida#849 — arrow keys nudge the path SUB-SELECTION (the
//     selected vertices), not the whole element.
//   - gridaco/grida#848 — Shift axis-locks a vertex drag to one axis,
//     matching whole-object translate.
//
// The surface is mounted at the document origin under an identity camera,
// so client px == world == SVG user units (see `attachSurface`). A path of
// straight `L` segments keeps the committed `d` a clean list of vertex
// coordinates we can read back by extracting the numbers in order.

import { afterEach, describe, expect, it } from "vitest";
import {
  attachSurface,
  nodeIdByName,
  pointer,
  type AttachedSurface,
} from "./_browser-helpers";

// v0 (100,100) · v1 (300,100) · v2 (300,300). Well separated so a tap at a
// vertex is unambiguous and a 1px nudge is plainly visible.
const PATH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <path id="p" d="M 100 100 L 300 100 L 300 300" fill="none" stroke="#222"/>
</svg>`;

let s: AttachedSurface | null = null;
afterEach(() => {
  s?.dispose();
  s = null;
});

/** Vertex coordinates of the committed `d`, in order. All segments here are
 *  straight `L`s with zero tangents, so the path data is just the vertex
 *  list — extract every number and pair them up. */
function vertices(a: AttachedSurface): Array<[number, number]> {
  const d = a.editor.document.get_attr(nodeIdByName(a.editor, "p"), "d") ?? "";
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

/** Dispatch an arrow keydown straight into the keymap (bypasses the
 *  surface's attention gate, which is irrelevant to the routing under
 *  test). The surface has registered its `transform.nudge` override on the
 *  registry, so this still exercises `handle_nudge_command`. */
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

function enterPathEdit(a: AttachedSurface): void {
  const id = nodeIdByName(a.editor, "p");
  a.editor.commands.select(id);
  a.editor.enter_content_edit(id);
  expect(a.editor.state.mode).toBe("edit-content");
}

/** Tap (down+up, no drag) at a client point — selects whatever control is
 *  under the cursor. */
function tap(a: AttachedSurface, x: number, y: number): void {
  const win = a.container.ownerDocument.defaultView!;
  pointer(a.container, "pointerdown", x, y, 1);
  pointer(win, "pointerup", x, y, 0);
}

describe("#849 — arrow nudge moves the path sub-selection, not the element", () => {
  it("ArrowRight moves only the selected vertex by 1px", () => {
    s = attachSurface(PATH);
    enterPathEdit(s);

    // Select v1 by tapping it.
    tap(s, 300, 100);

    expect(arrow(s, "ArrowRight")).toBe(true);

    const v = vertices(s);
    expect(v[0]).toEqual([100, 100]); // v0 unchanged
    expect(v[1]).toEqual([301, 100]); // v1 nudged +1 x
    expect(v[2]).toEqual([300, 300]); // v2 unchanged
  });

  it("Shift+ArrowDown moves the selected vertex by 10px in y", () => {
    s = attachSurface(PATH);
    enterPathEdit(s);
    tap(s, 300, 100); // v1

    expect(arrow(s, "ArrowDown", true)).toBe(true);

    const v = vertices(s);
    expect(v[0]).toEqual([100, 100]);
    expect(v[1]).toEqual([300, 110]);
    expect(v[2]).toEqual([300, 300]);
  });

  it("with no sub-selection, arrows are a consumed no-op (element does not move)", () => {
    s = attachSurface(PATH);
    enterPathEdit(s);
    // No vertex tapped — empty sub-selection.
    const before = vertices(s);
    expect(arrow(s, "ArrowRight")).toBe(true); // owned by path-edit
    expect(vertices(s)).toEqual(before); // nothing moved
  });
});

describe("#848 — Shift axis-locks a vertex drag", () => {
  it("a diagonal drag with Shift collapses to the dominant axis", () => {
    s = attachSurface(PATH);
    enterPathEdit(s);
    const win = s.container.ownerDocument.defaultView!;
    const shift = { shiftKey: true };

    // Drag v1 from (300,100) toward (340,112): |dx|=40 > |dy|=12, so the
    // lock keeps x and zeroes y.
    pointer(s.container, "pointerdown", 300, 100, 1, shift);
    pointer(win, "pointermove", 320, 106, 1, shift);
    pointer(win, "pointermove", 340, 112, 1, shift);
    pointer(win, "pointerup", 340, 112, 0, shift);

    const v = vertices(s);
    expect(v[0]).toEqual([100, 100]); // v0 unchanged
    expect(v[1][0]).toBeCloseTo(340, 3); // x followed the drag
    expect(v[1][1]).toBeCloseTo(100, 3); // y locked at the start
    expect(v[2]).toEqual([300, 300]); // v2 unchanged
  });

  it("without Shift the same drag moves both axes (lock is opt-in)", () => {
    s = attachSurface(PATH);
    enterPathEdit(s);
    const win = s.container.ownerDocument.defaultView!;

    pointer(s.container, "pointerdown", 300, 100, 1);
    pointer(win, "pointermove", 320, 106, 1);
    pointer(win, "pointermove", 340, 112, 1);
    pointer(win, "pointerup", 340, 112, 0);

    const v = vertices(s);
    expect(v[1][0]).toBeCloseTo(340, 3);
    expect(v[1][1]).toBeCloseTo(112, 3); // y followed too — no lock
  });

  it("a <line> endpoint drag with Shift collapses to the dominant axis", () => {
    // Horizontal line; drag the p2 endpoint (300,100) down-right with
    // Shift held. |dx|=40 > |dy|=12 ⇒ the lock keeps x and zeroes y, so
    // the line stays orthogonal.
    s = attachSurface(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
        <line id="ln" x1="100" y1="100" x2="300" y2="100" stroke="#222"/>
      </svg>`
    );
    const id = nodeIdByName(s.editor, "ln");
    s.editor.commands.select(id);
    s.editor.enter_content_edit(id);
    expect(s.editor.state.mode).toBe("edit-content");

    const win = s.container.ownerDocument.defaultView!;
    const shift = { shiftKey: true };
    pointer(s.container, "pointerdown", 300, 100, 1, shift);
    pointer(win, "pointermove", 320, 106, 1, shift);
    pointer(win, "pointermove", 340, 112, 1, shift);
    pointer(win, "pointerup", 340, 112, 0, shift);

    const num = (n: string) =>
      Number(s!.editor.document.get_attr(id, n) ?? "NaN");
    expect(num("x1")).toBeCloseTo(100, 3); // p1 untouched
    expect(num("y1")).toBeCloseTo(100, 3);
    expect(num("x2")).toBeCloseTo(340, 3); // p2 x followed the drag
    expect(num("y2")).toBeCloseTo(100, 3); // p2 y locked at the start
  });
});
