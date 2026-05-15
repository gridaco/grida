import type cmath from "@grida/cmath";
import type { NodeId, Rect } from "./gesture";

/**
 * Selection shape — what the chrome wraps.
 *
 * Hosts return a `SelectionShape` from `shapeOf(id)` so the HUD can lay out
 * the right kind of chrome:
 *
 * - **`rect`** — standard bounding box. Renders selection outline + 4 corner
 *   knobs, with virtual edge / rotation hit regions.
 * - **`line`** — two-endpoint primitive (e.g. SVG `<line>`). Renders the
 *   line segment + 2 endpoint knobs. No edge / rotation regions.
 * - **`unresolved`** — internal-only. Used inside `SelectionGroup` when the
 *   host gave a flat `NodeId[]` to `setSelection` — the chrome builder
 *   resolves the real shape by calling `shapeOf(id)` at frame build time.
 *   Hosts never emit this; treating it as host-facing would be a bug.
 *
 * Future kinds (e.g. `polyline`, `ellipse_oriented`) can be added without
 * breaking the existing kinds — the chrome builder branches on `kind`.
 */
export type SelectionShape =
  | { kind: "rect"; rect: Rect }
  | { kind: "line"; p1: cmath.Vector2; p2: cmath.Vector2 }
  | { kind: "unresolved"; id: string };

/**
 * A logical selection group. The HUD renders one chrome instance per group.
 *
 * The host pre-computes `shape` (typically the union of member bounds for
 * multi-node groups). Member `ids` are the gesture target — they all
 * translate/resize together as a unit.
 */
export interface SelectionGroup {
  ids: readonly NodeId[];
  shape: SelectionShape;
}

import cmathDefault from "@grida/cmath";

/**
 * Compute the axis-aligned bounding box of a `SelectionShape` in doc-space.
 * Used for layout math the chrome builder needs (e.g. handle positions).
 *
 * Throws on `kind: "unresolved"` — the chrome builder must resolve those
 * via `shapeOf` first.
 */
export function shapeBounds(shape: SelectionShape): Rect {
  if (shape.kind === "rect") return shape.rect;
  if (shape.kind === "line")
    return cmathDefault.rect.fromPoints([shape.p1, shape.p2]);
  throw new Error(
    `shapeBounds: cannot bound unresolved shape (id=${shape.id})`
  );
}
