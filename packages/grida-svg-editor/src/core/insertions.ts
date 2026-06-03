// Insertion subsystem — pure factory + drag math + default paint attrs.
//
// DOM-free. Sibling to `core/group.ts` (policy module). Internal — not
// exported from the package per P3 ("per-element semantics are internal
// architecture, not extension points"). Drives `commands.insert` /
// `commands.insert_preview` in `editor.ts` and the gesture driver in
// `dom.ts`. The attr writes here are unconditional (rect: x/y/w/h,
// ellipse: cx/cy/rx/ry, line: x1/y1/x2/y2) — newly-created nodes don't
// need the surgical baseline-preservation that `core/intents.ts` does
// for existing geometry.

import type { InsertableTag, Vec2 } from "../types";

/** Modifiers honored by the insertion drag. Shift constrains aspect /
 *  angle; Alt treats the anchor as center instead of corner. They
 *  compose. */
export type DragModifiers = { shift: boolean; alt: boolean };

export namespace insertions {
  /** Default size used for click-no-drag commit and as the implicit
   *  "size" for default_attrs callers that don't supply one. CSS px in
   *  world space. */
  export const DEFAULT_SIZE = 100;

  /** v1 default fill — gray so newly-drawn shapes are visible against
   *  white. Matches the main canvas convention. A future preset may
   *  override. */
  export const DEFAULT_FILL = "#D9D9D9";

  /**
   * Initial attrs for the moment of pointer-down — zero-size at the
   * click point. Seeds the pending node before any drag movement so the
   * HUD selection chrome can render a (zero-size) box without a flicker.
   *
   * Per tag:
   *  - rect    → x = px, y = py, width = 0, height = 0
   *  - ellipse → cx = px, cy = py, rx = 0, ry = 0
   *  - line    → x1 = x2 = px, y1 = y2 = py
   */
  export function initial_attrs(
    tag: InsertableTag,
    point: Vec2
  ): Record<string, string> {
    switch (tag) {
      case "rect":
        return {
          x: fmt(point.x),
          y: fmt(point.y),
          width: "0",
          height: "0",
        };
      case "ellipse":
        return {
          cx: fmt(point.x),
          cy: fmt(point.y),
          rx: "0",
          ry: "0",
        };
      case "line":
        return {
          x1: fmt(point.x),
          y1: fmt(point.y),
          x2: fmt(point.x),
          y2: fmt(point.y),
        };
    }
  }

  /**
   * Attrs for click-no-drag commit — default-sized shape centered on the
   * click point. (Rect's `x`/`y` are top-left in SVG, so we offset by
   * `size/2` to center; ellipse's `cx`/`cy` are already center.)
   */
  export function default_attrs(
    tag: InsertableTag,
    point: Vec2,
    size: number = DEFAULT_SIZE
  ): Record<string, string> {
    switch (tag) {
      case "rect":
        return {
          x: fmt(point.x - size / 2),
          y: fmt(point.y - size / 2),
          width: fmt(size),
          height: fmt(size),
        };
      case "ellipse":
        return {
          cx: fmt(point.x),
          cy: fmt(point.y),
          rx: fmt(size / 2),
          ry: fmt(size / 2),
        };
      case "line":
        return {
          x1: fmt(point.x - size / 2),
          y1: fmt(point.y),
          x2: fmt(point.x + size / 2),
          y2: fmt(point.y),
        };
    }
  }

  /**
   * Drag math — pure. Given anchor + current + modifiers, returns
   * geometry attrs for the in-progress node.
   *
   * Per-tag rules:
   *  - rect    → x / y / width / height
   *      Shift: width === height (the larger of the two deltas wins,
   *             signs preserved so the rect can still flip across the
   *             anchor).
   *      Alt:   anchor is treated as center; rect grows symmetrically.
   *  - ellipse → cx / cy / rx / ry
   *      Shift: rx === ry (uniform circle).
   *      Alt:   anchor is treated as center (default for ellipse anyway
   *             — Alt makes the anchor act as center even when Shift is
   *             on).
   *      Without Alt the anchor is one corner of the ellipse's bbox;
   *      with Alt the anchor is the center.
   *  - line    → x1 / y1 / x2 / y2
   *      Shift: angle quantized to 0° / 45° / 90°.
   *      Alt:   anchor is the midpoint of the line (mirror the drag).
   */
  export function compute_drag_attrs(
    tag: InsertableTag,
    anchor: Vec2,
    current: Vec2,
    modifiers: DragModifiers
  ): Record<string, string> {
    switch (tag) {
      case "rect":
        return rect_attrs(anchor, current, modifiers);
      case "ellipse":
        return ellipse_attrs(anchor, current, modifiers);
      case "line":
        return line_attrs(anchor, current, modifiers);
    }
  }

  /** Default paint attrs for a freshly-inserted shape. v1: gray fill, no
   *  stroke. Line gets a stroke (otherwise it's invisible — `<line>` has
   *  no fill area). Hard-coded for v1; a future preset may swap
   *  these. */
  export function default_paint_attrs(
    tag: InsertableTag
  ): Record<string, string> {
    switch (tag) {
      case "rect":
      case "ellipse":
        return { fill: DEFAULT_FILL };
      case "line":
        return { stroke: "#000000", "stroke-width": "1" };
    }
  }

  /** v1 default font appearance for a freshly-placed `<text>`: 16px
   *  sans-serif, black fill — visible and editable the instant it's
   *  placed. Hard-coded for v1, exactly like the shape paint defaults
   *  above; promote to `EditorStyle.insertion_*` only when a host asks
   *  for brand defaults (see TODO.md "Tunable defaults via EditorStyle").
   *
   *  `<text>` is intentionally NOT an `InsertableTag` — its creation is a
   *  click-only gesture, not drag-to-size — so it lives outside the
   *  per-tag switches above rather than forcing a `size` it has no use
   *  for. */
  export const DEFAULT_TEXT_FONT_SIZE = 16;
  export const DEFAULT_TEXT_FONT_FAMILY = "sans-serif";
  export const DEFAULT_TEXT_FILL = "#000000";

  /** Attrs for a click-to-place text insert: anchor at the click point
   *  plus the default font appearance. `point` is in world space. */
  export function default_text_attrs(point: Vec2): Record<string, string> {
    return {
      x: fmt(point.x),
      y: fmt(point.y),
      "font-size": String(DEFAULT_TEXT_FONT_SIZE),
      "font-family": DEFAULT_TEXT_FONT_FAMILY,
      fill: DEFAULT_TEXT_FILL,
    };
  }

  // ─── Per-tag drag math ───────────────────────────────────────────────

  function rect_attrs(
    anchor: Vec2,
    current: Vec2,
    mods: DragModifiers
  ): Record<string, string> {
    let dx = current.x - anchor.x;
    let dy = current.y - anchor.y;

    if (mods.shift) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      // Sign defaults to +m on an exactly-on-axis drag
      // (Math.sign(0) === 0).
      dx = dx < 0 ? -m : m;
      dy = dy < 0 ? -m : m;
    }

    let x: number;
    let y: number;
    let w: number;
    let h: number;

    if (mods.alt) {
      x = anchor.x - Math.abs(dx);
      y = anchor.y - Math.abs(dy);
      w = Math.abs(dx) * 2;
      h = Math.abs(dy) * 2;
    } else {
      x = Math.min(anchor.x, anchor.x + dx);
      y = Math.min(anchor.y, anchor.y + dy);
      w = Math.abs(dx);
      h = Math.abs(dy);
    }

    return {
      x: fmt(x),
      y: fmt(y),
      width: fmt(w),
      height: fmt(h),
    };
  }

  function ellipse_attrs(
    anchor: Vec2,
    current: Vec2,
    mods: DragModifiers
  ): Record<string, string> {
    let dx = current.x - anchor.x;
    let dy = current.y - anchor.y;

    if (mods.shift) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      dx = dx < 0 ? -m : m;
      dy = dy < 0 ? -m : m;
    }

    let cx: number;
    let cy: number;
    let rx: number;
    let ry: number;

    if (mods.alt) {
      cx = anchor.x;
      cy = anchor.y;
      rx = Math.abs(dx);
      ry = Math.abs(dy);
    } else {
      cx = anchor.x + dx / 2;
      cy = anchor.y + dy / 2;
      rx = Math.abs(dx) / 2;
      ry = Math.abs(dy) / 2;
    }

    return {
      cx: fmt(cx),
      cy: fmt(cy),
      rx: fmt(rx),
      ry: fmt(ry),
    };
  }

  function line_attrs(
    anchor: Vec2,
    current: Vec2,
    mods: DragModifiers
  ): Record<string, string> {
    let dx = current.x - anchor.x;
    let dy = current.y - anchor.y;

    if (mods.shift) {
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const angle = Math.atan2(dy, dx);
        const step = Math.PI / 4;
        const quantized = Math.round(angle / step) * step;
        dx = Math.cos(quantized) * len;
        dy = Math.sin(quantized) * len;
      }
    }

    let x1: number;
    let y1: number;
    let x2: number;
    let y2: number;

    if (mods.alt) {
      x1 = anchor.x - dx;
      y1 = anchor.y - dy;
      x2 = anchor.x + dx;
      y2 = anchor.y + dy;
    } else {
      x1 = anchor.x;
      y1 = anchor.y;
      x2 = anchor.x + dx;
      y2 = anchor.y + dy;
    }

    return {
      x1: fmt(x1),
      y1: fmt(y1),
      x2: fmt(x2),
      y2: fmt(y2),
    };
  }

  /** Format a numeric value for SVG attr output. Rounds to 4 decimals
   *  to suppress IEEE-754 noise (`0.30000000000000004` → `0.3`);
   *  `String()` drops trailing zeros and the decimal point for
   *  integers. */
  function fmt(n: number): string {
    return String(Math.round(n * 10000) / 10000);
  }
}
