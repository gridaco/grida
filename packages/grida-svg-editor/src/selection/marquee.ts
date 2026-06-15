// Marquee selection POLICY — pure, headless; the executable shadow of
// `packages/grida-svg-editor/docs/marquee-selection.md`.
//
// Every rule here is a deliberate UX OPINION (human-oriented, Figma-like),
// not spec or geometric necessity. It lives OUTSIDE `core/` on purpose:
// `core/` is the opinion-free engine (agnostic geometry from `@grida/cmath`,
// the marquee gesture from `@grida/hud`); THIS module is where the opinion —
// "which boxes a marquee selects" — is decided, so it can't masquerade as
// neutral math. The doc is the source of truth: each rule below is named to
// match it, and the tests quote those names so doc and code cannot drift.
//
// Selection is deterministic in (marquee rect, gesture-start selection,
// shift). `meta` is a ROUTING modifier only — it decides a drag IS a marquee
// (see `docs/wg/feat-editor/ux-surface/selection-intent.md`), never a
// resolution input — so it does not appear here.
//
// Rules (see docs/marquee-selection.md):
//   - shadow      — a box that fully CONTAINS the marquee is kept only when it
//                   is the FRONT-MOST box the marquee touches; a front box the
//                   marquee also touches shadows it.
//   - escape      — once the marquee no longer contains a box, the box is a
//                   normal hit again (corollary of `shadow`).
//   - paint-order — results are in paint order (front-most = last).
//   - additive    — shift unions the gesture-start baseline, baseline-first
//                   and deduped; shrinking releases fresh members, keeps the
//                   baseline.

import cmath from "@grida/cmath";
import type { NodeId } from "../types";

export namespace marquee_selection {
  /** An element id paired with its box, in the same frame as the marquee
   *  rect (the HUD's container CSS-px). Order is paint order, back → front,
   *  so the LAST touched box is the front-most (`paint-order`, `shadow`). */
  export type Box = readonly [NodeId, cmath.Rectangle];

  /**
   * `shadow` + `escape` + `paint-order`. The boxes a marquee selects this
   * frame, in paint order: every box the marquee intersects, minus any box
   * that fully CONTAINS the marquee while a box in front of it is also
   * touched (the front box shadows it). A containing box that is the
   * front-most touched box is kept.
   */
  export function hits(boxes: readonly Box[], rect: cmath.Rectangle): NodeId[] {
    const touched = boxes.filter(([, box]) => cmath.rect.intersects(box, rect));
    const front = touched.length - 1; // front-most touched box (paint order)
    const out: NodeId[] = [];
    for (let i = 0; i < touched.length; i++) {
      const [id, box] = touched[i];
      // A box that contains the marquee is shadowed unless it is front-most:
      // a drag inside it selects it; entering a front box selects that one
      // instead; escaping it (no longer containing the rect) keeps it.
      if (i !== front && cmath.rect.contains(box, rect)) continue;
      out.push(id);
    }
    return out;
  }

  /**
   * `additive`. The next selection for one frame. Non-additive: the hits ARE
   * the selection (empty → cleared). Additive (shift): hits union `baseline`,
   * baseline-first and deduped (empty hits → baseline unchanged). Feed the
   * result to `select(next, { mode: "replace" })` — every frame recomputes
   * the whole selection from the rect.
   */
  export function resolve(
    boxes: readonly Box[],
    rect: cmath.Rectangle,
    baseline: readonly NodeId[],
    opts: { additive?: boolean } = {}
  ): NodeId[] {
    const h = hits(boxes, rect);
    if (!opts.additive) return h;
    const out = [...baseline];
    const seen = new Set(baseline);
    for (const id of h) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }
}
