// Text-edit — named-class chrome.
//
// What this draws — a blinking caret (a fixed on-screen-thickness bar) and
// zero-or-more selection highlight rects (translucent fills), for inline text
// content-edit. Both are composited ON the HUD canvas, above the content and
// the selection box, so the caret is never occluded and the thickness stays
// constant at any zoom. This mirrors the Skia text-edit overlay
// (`crates/grida/src/overlay/widgets/text_edit_decoration.rs`).
//
// Anti-goals (what this class is NOT):
//
// - **Not a text-edit engine.** The host runs the editor and computes glyph
//   geometry (caret endpoints, selection rects) in a local frame; this only
//   projects and paints. No layout, no IME, no input.
// - **Not interactive.** Decoration-only — no gestures, intents, hit regions,
//   or hover. Hence no `intent.ts` / `priority.ts` (thinner than padding).
// - **Not path-following.** A single affine `transform` places the chrome;
//   a curved-baseline `<textPath>` caret is out of scope (a host emits
//   per-run chrome, each with its own local frame).

import cmath from "@grida/cmath";
import type { HUDPolyline, HUDScreenRect } from "../../primitives/types";
import type { TextEditChromeInput } from "./input";

/** On-screen caret thickness in CSS px — zoom-independent by construction. */
export const DEFAULT_CARET_SCREEN_WIDTH = 1.5;
const DEFAULT_CARET_COLOR = "#2563eb";
const DEFAULT_SELECTION_COLOR = "#2563eb";
const DEFAULT_SELECTION_OPACITY = 0.25;

/**
 * The primitives the text-edit chrome contributes to a frame. Decoration-only,
 * so this is raw draw primitives (not `OverlayElement`s with hit regions):
 *
 * - `polylines` — selection fills, doc-space polygons (the HUD applies the
 *   camera). Merge into the decoration `polylines` band.
 * - `screenRects` — the caret, a screen-sized rect anchored at a doc point.
 *   Merge into the `screenRects` band (above the selection box → never occluded).
 */
export interface TextEditChromeDraw {
  polylines: HUDPolyline[];
  screenRects: HUDScreenRect[];
}

/**
 * Build the per-frame text-edit chrome.
 *
 * Composition mirrors `chrome.ts:pushTransformedChrome`:
 * `local_to_screen = multiply(camera, chrome.transform)`. The selection rects
 * project to doc space via `chrome.transform` (the HUD applies the camera when
 * painting); the caret anchor projects the same way, while its on-screen
 * length + angle come from `local_to_screen` so the bar tracks the projected
 * glyph height and rotates with the text.
 *
 * @param camera the HUD's world→screen transform (`state.getTransform()`).
 */
export function buildTextEditChrome(input: {
  chrome: TextEditChromeInput;
  camera: cmath.Transform;
}): TextEditChromeDraw {
  const { chrome, camera } = input;
  const style = chrome.style ?? {};
  const caretColor = style.caretColor ?? DEFAULT_CARET_COLOR;
  const caretScreenWidth = style.caretScreenWidth ?? DEFAULT_CARET_SCREEN_WIDTH;
  const selectionColor = style.selectionColor ?? DEFAULT_SELECTION_COLOR;
  const selectionOpacity = style.selectionOpacity ?? DEFAULT_SELECTION_OPACITY;
  const { group } = chrome;

  const polylines: HUDPolyline[] = [];
  const screenRects: HUDScreenRect[] = [];

  const local_to_screen = cmath.transform.multiply(camera, chrome.transform);

  // ── Selection fills (translucent, doc-space polygons) ────────────────────
  for (const r of chrome.selectionRects ?? []) {
    const corners = cmath.rect
      .toCorners({ x: r.x, y: r.y, width: r.width, height: r.height })
      .map((p) => cmath.vector2.transform(p, chrome.transform));
    polylines.push({
      points: [...corners, corners[0]],
      stroke: false,
      fill: true,
      fillPaint: {
        kind: "solid",
        color: selectionColor,
        opacity: selectionOpacity,
      },
      group,
    });
  }

  // ── Caret (constant on-screen thickness, doc-anchored, rotates with text) ─
  if (chrome.caret && chrome.caretVisible) {
    const { top, bottom } = chrome.caret;
    const mid_local: cmath.Vector2 = [
      (top[0] + bottom[0]) / 2,
      (top[1] + bottom[1]) / 2,
    ];
    const anchor_doc = cmath.vector2.transform(mid_local, chrome.transform);
    const top_screen = cmath.vector2.transform(top, local_to_screen);
    const bottom_screen = cmath.vector2.transform(bottom, local_to_screen);
    const dx = bottom_screen[0] - top_screen[0];
    const dy = bottom_screen[1] - top_screen[1];
    const screen_len = Math.hypot(dx, dy);
    // Angle from the projected caret segment itself — NOT the matrix's rotation
    // component (`cmath.transform.angle`). The two agree under rotation/scale
    // but diverge under shear/skew, where the matrix x-axis no longer matches
    // the caret's on-screen slant. Deriving it from the segment keeps the bar
    // aligned with `screen_len` (same endpoints). `-90°` because the screen
    // rect's long axis (height) is its local +y.
    const angle_rad = Math.atan2(dy, dx) - Math.PI / 2;
    screenRects.push({
      x: anchor_doc[0],
      y: anchor_doc[1],
      width: caretScreenWidth,
      height: screen_len,
      anchor: "center",
      angle: angle_rad,
      fill: true,
      stroke: false,
      fillColor: caretColor,
      group,
    });
  }

  return { polylines, screenRects };
}
