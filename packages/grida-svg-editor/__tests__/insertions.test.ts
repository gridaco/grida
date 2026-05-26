// Headless tests for the insertion subsystem:
//   - `compute_drag_attrs` per-tag × modifier combinations (purely numeric).
//   - `default_attrs` / `initial_attrs` defaults.
//   - `commands.insert` apply / revert round-trip.
//   - `commands.insert_preview` lifecycle (update / commit / discard).
//   - `tool.set` keymap registry behavior (chain semantics + mode guard).

import { describe, expect, it } from "vitest";
import { insertions } from "../src/core/insertions";
import { createSvgEditor } from "../src/index";

const EMPTY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>`;
const WITH_RECT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/></svg>`;

describe("insertions / drag math", () => {
  describe("rect", () => {
    it("plain drag — top-left at min, width/height at abs delta", () => {
      const a = { x: 50, y: 50 };
      const b = { x: 70, y: 90 };
      expect(
        insertions.compute_drag_attrs("rect", a, b, {
          shift: false,
          alt: false,
        })
      ).toEqual({
        x: "50",
        y: "50",
        width: "20",
        height: "40",
      });
    });

    it("plain drag — anchor below/right of current works (rect flips)", () => {
      const a = { x: 70, y: 90 };
      const b = { x: 50, y: 50 };
      expect(
        insertions.compute_drag_attrs("rect", a, b, {
          shift: false,
          alt: false,
        })
      ).toEqual({
        x: "50",
        y: "50",
        width: "20",
        height: "40",
      });
    });

    it("Shift: width === height (square; larger axis wins)", () => {
      const a = { x: 0, y: 0 };
      const b = { x: 30, y: 70 };
      const attrs = insertions.compute_drag_attrs("rect", a, b, {
        shift: true,
        alt: false,
      });
      expect(attrs.width).toBe(attrs.height);
      expect(attrs.width).toBe("70");
    });

    it("Alt: anchor is center (rect grows symmetrically)", () => {
      const a = { x: 100, y: 100 };
      const b = { x: 130, y: 140 };
      expect(
        insertions.compute_drag_attrs("rect", a, b, { shift: false, alt: true })
      ).toEqual({
        x: "70",
        y: "60",
        width: "60",
        height: "80",
      });
    });

    it("Shift+Alt: square drawn from center", () => {
      const a = { x: 100, y: 100 };
      const b = { x: 110, y: 130 };
      const attrs = insertions.compute_drag_attrs("rect", a, b, {
        shift: true,
        alt: true,
      });
      expect(attrs.width).toBe(attrs.height);
      // Larger magnitude is |dy|=30; with Alt the rect spans 2× that.
      expect(attrs.width).toBe("60");
      expect(attrs.height).toBe("60");
    });
  });

  describe("ellipse", () => {
    it("plain drag — bbox corners; cx/cy at midpoint, rx/ry at half-extent", () => {
      const a = { x: 0, y: 0 };
      const b = { x: 40, y: 20 };
      expect(
        insertions.compute_drag_attrs("ellipse", a, b, {
          shift: false,
          alt: false,
        })
      ).toEqual({
        cx: "20",
        cy: "10",
        rx: "20",
        ry: "10",
      });
    });

    it("Shift: rx === ry (uniform circle)", () => {
      const a = { x: 0, y: 0 };
      const b = { x: 60, y: 20 };
      const attrs = insertions.compute_drag_attrs("ellipse", a, b, {
        shift: true,
        alt: false,
      });
      expect(attrs.rx).toBe(attrs.ry);
    });

    it("Alt: anchor is center, pointer is radius", () => {
      const a = { x: 100, y: 100 };
      const b = { x: 150, y: 130 };
      expect(
        insertions.compute_drag_attrs("ellipse", a, b, {
          shift: false,
          alt: true,
        })
      ).toEqual({
        cx: "100",
        cy: "100",
        rx: "50",
        ry: "30",
      });
    });
  });

  describe("line", () => {
    it("plain drag — anchor → current", () => {
      const a = { x: 10, y: 20 };
      const b = { x: 50, y: 80 };
      expect(
        insertions.compute_drag_attrs("line", a, b, {
          shift: false,
          alt: false,
        })
      ).toEqual({
        x1: "10",
        y1: "20",
        x2: "50",
        y2: "80",
      });
    });

    it("Shift: angle quantized to 0/45/90", () => {
      const a = { x: 0, y: 0 };
      // ~80° drag → snaps to 90°: x2 = x1, y2 = y1 + length.
      const b = { x: 5, y: 50 };
      const attrs = insertions.compute_drag_attrs("line", a, b, {
        shift: true,
        alt: false,
      });
      // Should collapse onto the vertical axis.
      expect(parseFloat(attrs.x2)).toBeCloseTo(0, 4);
      // Length preserved.
      const len = Math.hypot(
        parseFloat(attrs.x2) - parseFloat(attrs.x1),
        parseFloat(attrs.y2) - parseFloat(attrs.y1)
      );
      expect(len).toBeCloseTo(Math.hypot(5, 50), 4);
    });

    it("Alt: anchor is midpoint (line mirrors)", () => {
      const a = { x: 100, y: 100 };
      const b = { x: 130, y: 110 };
      expect(
        insertions.compute_drag_attrs("line", a, b, { shift: false, alt: true })
      ).toEqual({
        x1: "70",
        y1: "90",
        x2: "130",
        y2: "110",
      });
    });
  });

  describe("initial_attrs (zero-size at click point)", () => {
    it("rect: zero w/h at click point", () => {
      expect(insertions.initial_attrs("rect", { x: 10, y: 20 })).toEqual({
        x: "10",
        y: "20",
        width: "0",
        height: "0",
      });
    });

    it("ellipse: zero radii at click point", () => {
      expect(insertions.initial_attrs("ellipse", { x: 10, y: 20 })).toEqual({
        cx: "10",
        cy: "20",
        rx: "0",
        ry: "0",
      });
    });

    it("line: zero length at click point", () => {
      expect(insertions.initial_attrs("line", { x: 10, y: 20 })).toEqual({
        x1: "10",
        y1: "20",
        x2: "10",
        y2: "20",
      });
    });
  });

  describe("default_attrs (click-no-drag commit, default-sized)", () => {
    it("rect: 100×100 centered on click", () => {
      expect(insertions.default_attrs("rect", { x: 100, y: 100 })).toEqual({
        x: "50",
        y: "50",
        width: "100",
        height: "100",
      });
    });

    it("ellipse: 100×100 circle centered on click", () => {
      expect(insertions.default_attrs("ellipse", { x: 100, y: 100 })).toEqual({
        cx: "100",
        cy: "100",
        rx: "50",
        ry: "50",
      });
    });

    it("line: horizontal 100-px segment centered on click", () => {
      expect(insertions.default_attrs("line", { x: 100, y: 100 })).toEqual({
        x1: "50",
        y1: "100",
        x2: "150",
        y2: "100",
      });
    });
  });
});

describe("commands.insert (atomic one-shot)", () => {
  it("inserts at root, selects new node, single undo step", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const baseline = editor.serialize();

    const id = editor.commands.insert("rect", {
      x: "10",
      y: "20",
      width: "30",
      height: "40",
    });

    expect(editor.state.selection).toEqual([id]);
    expect(editor.state.can_undo).toBe(true);

    // Default paint attr was merged.
    const node = editor.tree().nodes.get(id);
    expect(node?.tag).toBe("rect");

    // Undo restores byte-equal SVG.
    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);

    // Redo re-applies and re-selects.
    editor.commands.redo();
    expect(editor.state.selection).toEqual([id]);
  });

  it("merges default_paint_attrs (fill gray) for rect; caller attrs win", () => {
    const editor = createSvgEditor({ svg: EMPTY });

    // No fill in attrs — gets the default gray.
    const id1 = editor.commands.insert("rect", {
      x: "0",
      y: "0",
      width: "10",
      height: "10",
    });
    const fill1 = editor.document.get_attr(id1, "fill");
    expect(fill1).toBe("#D9D9D9");

    // Caller-supplied fill wins.
    const id2 = editor.commands.insert("rect", {
      x: "0",
      y: "0",
      width: "10",
      height: "10",
      fill: "red",
    });
    expect(editor.document.get_attr(id2, "fill")).toBe("red");
  });

  it("doesn't auto-select when opts.select === false", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const before = editor.state.selection;
    editor.commands.insert(
      "ellipse",
      { cx: "0", cy: "0", rx: "5", ry: "5" },
      { select: false }
    );
    expect(editor.state.selection).toEqual(before);
  });
});

describe("commands.insert_preview (drag-bracketed)", () => {
  it("commit collapses into one undo step", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const baseline = editor.serialize();

    const session = editor.commands.insert_preview("rect", {
      x: "0",
      y: "0",
      width: "0",
      height: "0",
    });
    // Several per-frame updates.
    session.update({ width: "5", height: "5" });
    session.update({ width: "10", height: "10" });
    session.update({ width: "30", height: "40" });
    session.commit();

    // Single undo step despite many updates.
    expect(editor.state.can_undo).toBe(true);
    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });

  it("discard rolls the doc back as if nothing happened", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const baseline = editor.serialize();
    const before_selection = editor.state.selection;

    const session = editor.commands.insert_preview("ellipse", {
      cx: "0",
      cy: "0",
      rx: "0",
      ry: "0",
    });
    session.update({ rx: "10", ry: "10" });
    session.discard();

    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.selection).toEqual(before_selection);
    expect(editor.state.can_undo).toBe(false);
  });

  it("selects the pending node while the session is open", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const session = editor.commands.insert_preview("rect", {
      x: "0",
      y: "0",
      width: "0",
      height: "0",
    });
    expect(editor.state.selection).toEqual([session.id]);
    session.discard();
  });

  it("session methods are idempotent — re-commit/discard is a no-op", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const session = editor.commands.insert_preview("rect", {
      x: "0",
      y: "0",
      width: "10",
      height: "10",
    });
    session.commit();
    // Should not throw or push another history entry.
    expect(() => session.commit()).not.toThrow();
    expect(() => session.discard()).not.toThrow();
    expect(() => session.update({ width: "999" })).not.toThrow();
  });
});

describe("editor.set_tool", () => {
  it("defaults to { type: 'cursor' }", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    expect(editor.state.tool).toEqual({ type: "cursor" });
  });

  it("changes tool and bumps state.version", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const v0 = editor.state.version;
    editor.set_tool({ type: "insert", tag: "rect" });
    expect(editor.state.tool).toEqual({ type: "insert", tag: "rect" });
    expect(editor.state.version).toBeGreaterThan(v0);
  });

  it("setting same tool is a no-op (no emit)", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    editor.set_tool({ type: "insert", tag: "rect" });
    const v0 = editor.state.version;
    editor.set_tool({ type: "insert", tag: "rect" });
    expect(editor.state.version).toBe(v0);
  });

  it("load() resets to cursor", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    editor.set_tool({ type: "insert", tag: "rect" });
    editor.load(EMPTY);
    expect(editor.state.tool).toEqual({ type: "cursor" });
  });
});

describe("gesture ordering (matches main canvas pattern)", () => {
  // These tests pin the contract that the click-no-drag path and the
  // drag path produce structurally different history shapes. Both ship
  // a single undo step, but click-no-drag uses `commands.insert` (one
  // atomic mutation) and drag uses `commands.insert_preview` + commit.
  // The shape difference is visible at the IR level: click-no-drag
  // never creates a 0-size node, drag does briefly.

  it("commands.insert (click-no-drag analog) yields one rect, one undo step", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    editor.commands.insert(
      "rect",
      // insertions.default_attrs(rect, {100, 100}) shape — 100x100 centered.
      { x: "50", y: "50", width: "100", height: "100" }
    );
    const rects = [...editor.tree().nodes.values()].filter(
      (n) => n.tag === "rect"
    );
    expect(rects.length).toBe(1);
    expect(editor.state.can_undo).toBe(true);
    editor.commands.undo();
    expect(
      [...editor.tree().nodes.values()].filter((n) => n.tag === "rect").length
    ).toBe(0);
    expect(editor.state.can_undo).toBe(false);
  });

  it("insert_preview (drag analog) commits to one undo step despite per-frame updates", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const session = editor.commands.insert_preview("rect", {
      x: "100",
      y: "100",
      width: "0",
      height: "0",
    });
    // Simulate per-frame drag updates.
    for (let i = 1; i <= 20; i++) {
      session.update({ width: String(i * 2), height: String(i * 3) });
    }
    session.commit();
    expect(editor.state.can_undo).toBe(true);
    editor.commands.undo();
    expect(
      [...editor.tree().nodes.values()].filter((n) => n.tag === "rect").length
    ).toBe(0);
    // Single undo step covered the entire drag.
    expect(editor.state.can_undo).toBe(false);
  });

  it("insert_preview discard during 'armed' analog (immediate discard before any update) is a clean revert", () => {
    // Simulates the user pressing pointer-down then Escape before any
    // pointer-move crosses the drag threshold. The svg-editor gesture
    // driver wouldn't even open a preview here (it stays in 'armed'
    // phase). But the lower-level `insert_preview` API still has to
    // support immediate-discard cleanly for headless callers.
    const editor = createSvgEditor({ svg: WITH_RECT });
    const baseline = editor.serialize();
    const session = editor.commands.insert_preview("ellipse", {
      cx: "50",
      cy: "50",
      rx: "0",
      ry: "0",
    });
    session.discard();
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("keymap registry / tool.set", () => {
  it("tool.set handler refuses during edit-content mode", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    editor.commands.set_mode("edit-content");
    const consumed = editor.commands.invoke("tool.set", {
      type: "insert",
      tag: "rect",
    });
    expect(consumed).toBe(false);
    expect(editor.state.tool).toEqual({ type: "cursor" });
  });

  it("tool.set handler updates tool in select mode", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const consumed = editor.commands.invoke("tool.set", {
      type: "insert",
      tag: "ellipse",
    });
    expect(consumed).toBe(true);
    expect(editor.state.tool).toEqual({ type: "insert", tag: "ellipse" });
  });

  // REGRESSION: pressing V (cursor) during path content-edit was rejected
  // because the gate required `mode === "select"` for every non-lasso tool.
  // That broke "Q to enter lasso, V to exit back to cursor" — the user had
  // no way to leave lasso without exiting content-edit. Cursor must be
  // valid in any mode.
  it("tool.set 'cursor' is accepted in edit-content mode (Q→V exit path)", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    editor.commands.set_mode("edit-content");
    editor.set_tool({ type: "lasso" });
    expect(editor.state.tool).toEqual({ type: "lasso" });
    const consumed = editor.commands.invoke("tool.set", { type: "cursor" });
    expect(consumed).toBe(true);
    expect(editor.state.tool).toEqual({ type: "cursor" });
    // Mode is unchanged — V exits the tool, not content-edit.
    expect(editor.state.mode).toBe("edit-content");
  });

  it("tool.set 'lasso' refuses in select mode (vector-edit-only)", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const consumed = editor.commands.invoke("tool.set", { type: "lasso" });
    expect(consumed).toBe(false);
    expect(editor.state.tool).toEqual({ type: "cursor" });
  });

  it("tool.set 'lasso' is accepted in edit-content mode", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    editor.commands.set_mode("edit-content");
    const consumed = editor.commands.invoke("tool.set", { type: "lasso" });
    expect(consumed).toBe(true);
    expect(editor.state.tool).toEqual({ type: "lasso" });
  });

  it("tool.set 'bend' refuses in select mode (vector-edit-only)", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const consumed = editor.commands.invoke("tool.set", { type: "bend" });
    expect(consumed).toBe(false);
    expect(editor.state.tool).toEqual({ type: "cursor" });
  });

  it("tool.set 'bend' is accepted in edit-content mode", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    editor.commands.set_mode("edit-content");
    const consumed = editor.commands.invoke("tool.set", { type: "bend" });
    expect(consumed).toBe(true);
    expect(editor.state.tool).toEqual({ type: "bend" });
  });
});
