// Pure-compute alignment helper, paired with `apply_translate`.
//
// Given members (id + world-space bbox) and a target rect, returns per-member
// translation deltas that align each member to the requested edge or center
// of the target. The caller picks the target rect — union of selection for
// multi-selection align, parent's bbox for single-selection align.

import type { NodeId, Rect, Vec2 } from "../types";

export type AlignDirection =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "horizontal_centers"
  | "vertical_centers";

export type AlignMember = {
  readonly id: NodeId;
  readonly bbox: Rect;
};

/**
 * Compute per-member translation deltas to align `members` against `target`.
 *
 * Convention (matches Figma menu labels and `cmath.rect.alignA`):
 *   - `left` / `right`           → shift X so each left/right edge matches target's
 *   - `top` / `bottom`           → shift Y so each top/bottom edge matches target's
 *   - `horizontal_centers`       → shift X so each center-X matches target's center-X
 *   - `vertical_centers`         → shift Y so each center-Y matches target's center-Y
 *
 * Members already at the target position are omitted from the returned map —
 * callers iterate non-zero deltas only.
 */
export function compute_align_deltas(
  members: ReadonlyArray<AlignMember>,
  target: Rect,
  direction: AlignDirection
): Map<NodeId, Vec2> {
  const out = new Map<NodeId, Vec2>();
  for (const m of members) {
    const d = delta_for(m.bbox, target, direction);
    if (d.x !== 0 || d.y !== 0) out.set(m.id, d);
  }
  return out;
}

function delta_for(bbox: Rect, target: Rect, direction: AlignDirection): Vec2 {
  switch (direction) {
    case "left":
      return { x: target.x - bbox.x, y: 0 };
    case "right":
      return {
        x: target.x + target.width - (bbox.x + bbox.width),
        y: 0,
      };
    case "top":
      return { x: 0, y: target.y - bbox.y };
    case "bottom":
      return {
        x: 0,
        y: target.y + target.height - (bbox.y + bbox.height),
      };
    case "horizontal_centers":
      return {
        x: target.x + target.width / 2 - (bbox.x + bbox.width / 2),
        y: 0,
      };
    case "vertical_centers":
      return {
        x: 0,
        y: target.y + target.height / 2 - (bbox.y + bbox.height / 2),
      };
  }
}
