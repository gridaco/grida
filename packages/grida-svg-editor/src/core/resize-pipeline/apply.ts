// Plan → DOM mutation. Editor-specific: imports SvgDocument + intents.
//
// `applyResizePlan` writes the plan's world-space `(dx, dy)` straight
// into `compute_resize_factors` + `apply_resize`. For flat documents
// (the editor's design target — no nested `<svg>`, no `<g transform>`
// ancestor), world-space ≡ each element's own-frame, so attribute
// writes use the world delta directly. Documents with transformed
// ancestors fall outside v1 scope; they would need a per-element
// `getCTM().inverse()` here.
//
// Multi-member group resize: `apply_resize` accepts an arbitrary
// `origin`, so each member can be scaled around the shared union-bbox
// anchor without per-member projection — the per-tag constraint arms
// (circle uniform, text edge no-op, …) execute against each member's
// own captured baseline. The pipeline math runs once against the
// `plan.baseline` (union for multi, single bbox for single).

import type { NodeId } from "../../types";
import type { SvgDocument } from "../document";
import {
  apply_resize,
  compute_resize_factors,
  type ResizeBaseline,
  type ResizeDirection,
} from "../intents";
import type { ResizePlan } from "./pipeline";

export function applyResizePlan(
  doc: SvgDocument,
  plan: ResizePlan,
  phase: "preview" | "commit" = "commit"
): void {
  const f = compute_resize_factors(
    plan.baseline,
    plan.direction,
    plan.dx,
    plan.dy,
    false
  );
  const members = plan.members ?? [{ id: plan.id, baseline: plan.baseline }];
  for (const m of members) {
    apply_resize(doc, m.id, m.baseline, f.sx, f.sy, f.origin, phase);
  }
}

export function revertResizePlan(doc: SvgDocument, plan: ResizePlan): void {
  const f = compute_resize_factors(plan.baseline, plan.direction, 0, 0, false);
  const members = plan.members ?? [{ id: plan.id, baseline: plan.baseline }];
  for (const m of members) {
    // "preview" — revert restores baseline geometry; the transform was
    // never touched during preview, so no recomposition is owed.
    apply_resize(doc, m.id, m.baseline, 1, 1, f.origin, "preview");
  }
}

export type _ApplyDeps = {
  doc: SvgDocument;
  id: NodeId;
  baseline: ResizeBaseline;
  direction: ResizeDirection;
};

/**
 * Synthesize a "group" baseline over an arbitrary union rect. The attrs
 * carrier is `rect`-kind so the pipeline math (snap / pixel-grid)
 * treats the group as free per-axis — per-member constraints (circle
 * uniform, text edge no-op) kick in at apply time against each
 * member's own captured baseline.
 *
 * For single-member groups callers should pass the member's own
 * baseline directly so the per-element snap correction (`eff.uniform`
 * branch) fires correctly.
 */
export function synthesize_group_baseline(union: {
  x: number;
  y: number;
  width: number;
  height: number;
}): ResizeBaseline {
  return {
    bbox: { x: union.x, y: union.y, width: union.width, height: union.height },
    attrs: {
      kind: "rect",
      x: union.x,
      y: union.y,
      w: union.width,
      h: union.height,
    },
  };
}
