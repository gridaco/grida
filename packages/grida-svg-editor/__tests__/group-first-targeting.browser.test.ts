// End-to-end proof of group-first hit-testing (#853) through the real HUD →
// intent → surface path in headless Chromium (so getBBox / getCTM are real and,
// under the identity camera mounted at origin, client px == world == SVG units).
//
// Centers on the organizing principle: the current selection defines the focus
// depth. A plain tap establishes / moves laterally at that depth; meta jumps to
// the leaf; a double-click descends one level (selection-aware, never trapped at
// depth 1); meta-DRAG still marquees (the #843 reconciliation).

import { afterEach, describe, expect, it } from "vitest";
import {
  attachSurface,
  clientCenter,
  committedWorldRect,
  nodeIdByName,
  pointer,
  type AttachedSurface,
} from "./_browser-helpers";

// A group G with two leaf rects; empty canvas around them.
const GROUPED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <g id="G">
    <rect id="A" x="100" y="100" width="80" height="80" fill="#39f"/>
    <rect id="B" x="300" y="100" width="80" height="80" fill="#f63"/>
  </g>
</svg>`;

// Four nested levels: root → G1 → G2 → G3 → A.
const DEEP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <g id="G1"><g id="G2"><g id="G3">
    <rect id="A" x="100" y="100" width="120" height="120" fill="#39f"/>
  </g></g></g>
</svg>`;

const GROUPED_TEXT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <g id="G"><text id="T" x="100" y="140" font-size="40">hello</text></g>
</svg>`;

const UNGROUPED_TEXT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <text id="T" x="100" y="140" font-size="40">hello</text>
</svg>`;

const NESTED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <svg id="inner" x="50" y="50" width="240" height="240">
    <rect id="R" x="20" y="20" width="100" height="100" fill="#39f"/>
  </svg>
</svg>`;

// A cousin layout: G2 holds a bare leaf X and a nested group G3 (which holds
// the leaves A, A2). X is a COUSIN of A — both descend from G2 but through
// different parents. All three rects are disjoint so hit-tests are unambiguous.
const COUSIN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <g id="G2">
    <rect id="X" x="40" y="200" width="80" height="80" fill="#3c3"/>
    <g id="G3">
      <rect id="A" x="40" y="40" width="80" height="80" fill="#39f"/>
      <rect id="A2" x="200" y="40" width="80" height="80" fill="#f63"/>
    </g>
  </g>
</svg>`;

let s: AttachedSurface | null = null;
afterEach(() => {
  s?.dispose();
  s = null;
});

const ids = (a: AttachedSurface, ...names: string[]) =>
  names.map((n) => nodeIdByName(a.editor, n));

/** A discrete click (down+up, no drag). `init` carries modifier state. */
function clickClient(
  a: AttachedSurface,
  x: number,
  y: number,
  init?: PointerEventInit & { button?: number }
): void {
  const win = a.container.ownerDocument.defaultView!;
  const button = init?.button ?? 0;
  pointer(a.container, "pointerdown", x, y, button === 0 ? 1 : 2, {
    button,
    ...init,
  });
  pointer(win, "pointerup", x, y, 0, { button, ...init });
}

/** Two clicks at the same point — the HUD's click tracker resolves a
 *  double-click (count ≥ 2) since they arrive synchronously (< 250 ms). */
function dblclickClient(a: AttachedSurface, x: number, y: number): void {
  clickClient(a, x, y);
  clickClient(a, x, y);
}

/** Real delay so the click tracker's 250 ms window lapses and the next click
 *  starts a fresh count (otherwise rapid clicks accumulate to 3, 4, …). */
const settle = () => new Promise((r) => setTimeout(r, 300));

const center = (a: AttachedSurface, name: string) =>
  clientCenter(a.elementByName(name));

/** Await one animation frame. The surface defers its idle hover re-pick to a
 *  RAF (`request_hover_repick`), so a selection-driven hover refresh lands on
 *  the next frame, not synchronously. */
const nextFrame = (a: AttachedSurface) =>
  new Promise<void>((r) => {
    a.container.ownerDocument.defaultView!.requestAnimationFrame(() => r());
  });

// ─── plain tap → topmost container ───────────────────────────────────────────

describe("plain click selects the topmost container", () => {
  it("a click on a grouped leaf selects the group", () => {
    s = attachSurface(GROUPED);
    const c = center(s, "A");
    clickClient(s, c.x, c.y);
    expect(s.editor.state.selection).toEqual(ids(s, "G"));
  });

  it("a nested <svg> acts as the container", () => {
    s = attachSurface(NESTED_SVG);
    const c = center(s, "R");
    clickClient(s, c.x, c.y);
    expect(s.editor.state.selection).toEqual(ids(s, "inner"));
  });
});

// ─── meta → leaf ─────────────────────────────────────────────────────────────

describe("meta drills to the leaf", () => {
  it("meta-click selects the leaf under the cursor, not the container", () => {
    s = attachSurface(GROUPED);
    const c = center(s, "A");
    clickClient(s, c.x, c.y, { metaKey: true });
    expect(s.editor.state.selection).toEqual(ids(s, "A"));
  });

  it("meta-hover flips the highlight to the leaf live, and back on release", () => {
    s = attachSurface(GROUPED);
    const win = s.container.ownerDocument.defaultView!;
    const c = center(s, "A");

    // Hover over A (inside G) → highlight previews the GROUP (group-first).
    pointer(win, "pointermove", c.x, c.y, 0);
    expect(s.editor.surface_hover()).toBe(ids(s, "G")[0]);

    // Press Meta with the pointer at rest → highlight flips to the leaf, live.
    win.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Meta",
        metaKey: true,
        bubbles: true,
      })
    );
    expect(s.editor.surface_hover()).toBe(ids(s, "A")[0]);

    // Release Meta → back to the group.
    win.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Meta", metaKey: false, bubbles: true })
    );
    expect(s.editor.surface_hover()).toBe(ids(s, "G")[0]);
  });
});

// ─── double-click drill — selection-aware, one level per step ────────────────

describe("double-click descends one level (never trapped at depth 1)", () => {
  it("progressive double-clicks march G1 → G2 → G3 → A, staying in select mode (drill never edits)", async () => {
    s = attachSurface(DEEP);
    const c = center(s, "A");

    // A plain click establishes focus at the topmost container.
    clickClient(s, c.x, c.y);
    expect(s.editor.state.selection).toEqual(ids(s, "G1"));

    await settle();
    dblclickClient(s, c.x, c.y);
    expect(s.editor.state.selection).toEqual(ids(s, "G2"));
    expect(s.editor.state.mode).toBe("select");

    await settle();
    dblclickClient(s, c.x, c.y);
    expect(s.editor.state.selection).toEqual(ids(s, "G3"));
    expect(s.editor.state.mode).toBe("select");

    // Descending onto the leaf itself SELECTS it — it does NOT enter edit.
    await settle();
    dblclickClient(s, c.x, c.y);
    expect(s.editor.state.selection).toEqual(ids(s, "A"));
    expect(s.editor.state.mode).toBe("select");
  });

  it("a double-click into a group selects the child WITHOUT entering edit (drill, not edit)", () => {
    s = attachSurface(GROUPED_TEXT);
    const c = center(s, "T");
    dblclickClient(s, c.x, c.y);
    expect(s.editor.state.selection).toEqual(ids(s, "T"));
    expect(s.editor.state.mode).toBe("select"); // drilled in, not editing
  });

  it("a second double-click on the now-focused leaf enters content-edit", async () => {
    s = attachSurface(GROUPED_TEXT);
    const c = center(s, "T");
    dblclickClient(s, c.x, c.y); // phase 1: descend → select T
    expect(s.editor.state.mode).toBe("select");
    await settle();
    dblclickClient(s, c.x, c.y); // phase 2: nowhere deeper → edit T
    expect(s.editor.state.selection).toEqual(ids(s, "T"));
    expect(s.editor.state.mode).toBe("edit-content");
  });

  it("a top-level editable node (no container to peel) enters content-edit on a single double-click", () => {
    s = attachSurface(UNGROUPED_TEXT);
    const c = center(s, "T");
    dblclickClient(s, c.x, c.y);
    expect(s.editor.state.selection).toEqual(ids(s, "T"));
    expect(s.editor.state.mode).toBe("edit-content");
  });
});

// ─── sibling-aware lateral move at the focus depth ───────────────────────────

describe("tap is sibling-aware at the focus depth", () => {
  it("with a leaf focused, clicking a sibling leaf stays at the leaf level", () => {
    s = attachSurface(GROUPED);
    // Focus the leaf A directly (as if drilled in).
    s.editor.commands.select(ids(s, "A"));
    const c = center(s, "B");
    clickClient(s, c.x, c.y);
    // B (A's sibling) is selected — NOT the group G.
    expect(s.editor.state.selection).toEqual(ids(s, "B"));
  });
});

// ─── no-climb — a tap never selects an ancestor of the selection ─────────────

describe("tap never climbs to an ancestor of the selection (no-climb)", () => {
  it("with a cousin leaf focused, clicking another cousin leaf selects the leaf, not the shared group", async () => {
    s = attachSurface(COUSIN);
    const c = center(s, "X");

    // Control: with nothing selected, a tap on X is group-first → G2 (this also
    // proves the coordinate lands on X's subtree).
    clickClient(s, c.x, c.y);
    expect(s.editor.state.selection).toEqual(ids(s, "G2"));

    // Focus leaf A (as if drilled into G2 → G3 → A), then tap X again.
    await settle(); // lapse the double-click window — this is a fresh tap
    s.editor.commands.select(ids(s, "A"));
    clickClient(s, c.x, c.y);
    // X wins over G2 (the container A and X share) — a tap never climbs to a
    // proper ancestor of the focus.
    expect(s.editor.state.selection).toEqual(ids(s, "X"));
  });
});

// ─── hover refreshes on selection change, without a pointer move ─────────────

describe("hover re-picks when the selection changes at rest (no pointer move)", () => {
  it("a programmatic selection change re-previews what a click would now select", async () => {
    s = attachSurface(DEEP); // root → G1 → G2 → G3 → A
    const win = s.container.ownerDocument.defaultView!;
    const c = center(s, "A");

    // Rest the pointer over A. Empty selection → group-first preview = G1.
    pointer(win, "pointermove", c.x, c.y, 0);
    expect(s.editor.surface_hover()).toBe(nodeIdByName(s.editor, "G1"));

    // Advance the focus to G2 WITHOUT moving the pointer (Escape / layers-panel
    // / drill all land here). The re-pick is deferred, so hover is still stale…
    s.editor.commands.select(ids(s, "G2"));
    expect(s.editor.surface_hover()).toBe(nodeIdByName(s.editor, "G1"));

    // …until the next frame, when it re-previews G2 (stay at the new focus).
    await nextFrame(s);
    expect(s.editor.surface_hover()).toBe(nodeIdByName(s.editor, "G2"));
  });

  it("a double-click drill re-previews the deeper focus without a pointer move", async () => {
    s = attachSurface(DEEP);
    const win = s.container.ownerDocument.defaultView!;
    const c = center(s, "A");

    pointer(win, "pointermove", c.x, c.y, 0);
    clickClient(s, c.x, c.y); // focus G1
    expect(s.editor.state.selection).toEqual(ids(s, "G1"));

    // Drill to G2. The select fires from inside `hud.dispatch` (onIntent), so
    // the re-pick MUST be deferred — a synchronous one would re-enter the HUD.
    await settle();
    dblclickClient(s, c.x, c.y);
    expect(s.editor.state.selection).toEqual(ids(s, "G2"));

    await nextFrame(s);
    expect(s.editor.surface_hover()).toBe(nodeIdByName(s.editor, "G2"));
  });

  it("does not re-pick while the pointer is off the canvas", async () => {
    s = attachSurface(DEEP);
    // No pointer ever observed over the canvas → nothing to re-pick.
    s.editor.commands.select(ids(s, "G2"));
    await nextFrame(s);
    expect(s.editor.surface_hover()).toBeNull();
  });
});

// ─── meta-drag still marquees (#843 reconciliation) ──────────────────────────

describe("meta-drag region-selects instead of moving (#843)", () => {
  it("a meta-drag over a grouped element marquees and never translates it", () => {
    s = attachSurface(GROUPED);
    const win = s.container.ownerDocument.defaultView!;
    const before = committedWorldRect(s.editor, "A");
    const a = center(s, "A");
    const meta = { metaKey: true };

    pointer(s.container, "pointerdown", a.x, a.y, 1, meta);
    pointer(win, "pointermove", a.x + 6, a.y + 6, 1, meta); // cross threshold → marquee
    pointer(win, "pointermove", 360, 170, 1, meta); // sweep across both rects
    pointer(win, "pointerup", 360, 170, 0, meta);

    // The element did NOT move (a non-meta body drag would have translated it).
    const after = committedWorldRect(s.editor, "A");
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
    // A region selection happened.
    expect(s.editor.state.selection.length).toBeGreaterThan(0);
    expect(s.editor.state.mode).toBe("select");
  });
});

// ─── empty space ─────────────────────────────────────────────────────────────

describe("empty canvas", () => {
  it("a plain click on empty space deselects", () => {
    s = attachSurface(GROUPED);
    s.editor.commands.select(ids(s, "G"));
    clickClient(s, 520, 350); // inside the svg, outside the rects
    expect(s.editor.state.selection).toEqual([]);
  });
});
