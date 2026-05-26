// Padding — public input + hover types.
//
// `input.ts` carries the named-class's public contract: the host-pushed
// input shape and the HUD-derived hover state. Both are `@unstable` until
// a second independent integration ratifies the shape.

import type cmath from "@grida/cmath";
import type { NodeId, Rect } from "../../event/gesture";
import type { HUDSemanticGroup } from "../../primitives/types";

/**
 * Input pushed by the host to enable padding chrome on a flex-parent
 * container. Schema-level feature flag — pass `null` (or never call
 * `setPaddingOverlay`) to disable. Hosts re-push on every padding /
 * container-rect change.
 *
 * @unstable Public shape may change until a second independent integration
 * ratifies it.
 */
export interface PaddingOverlayInput {
  node_id: NodeId;
  /** Container rect in doc-space (the node's bounding rect). */
  rect: Rect;
  /**
   * Per-side padding in doc-space units. Absent or `<= 0` = side not
   * drawn. Matches the 4-value model used by `layout_padding_{side}`.
   */
  padding: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  /**
   * Optional semantic group for visibility policy. The full overlay
   * fans out per-side rects + per-side handles; all carry the same
   * group so a single `SurfaceVisibilityPolicy` toggle suppresses the
   * whole model atomically.
   */
  group?: HUDSemanticGroup;
}

/**
 * Hover state for the padding model — HUD-owned. The padding region's
 * hover is set on every idle `pointer_move` from the hit-regions
 * registry; the chrome reads it each frame to render the stripe fill.
 *
 * `mirror_side` is non-null when alt is held AND the pointer is on a
 * `padding_region` — the renderer paints both the hovered side and its
 * opposite. Cleared on alt release on the next pointer-move (modifier
 * events alone don't re-derive hover; that's an acceptable v1 cost —
 * the user will be moving the mouse over the region to see the effect
 * anyway).
 */
export type PaddingHover =
  | {
      kind: "padding_region";
      node_id: NodeId;
      side: cmath.RectangleSide;
      mirror_side?: cmath.RectangleSide;
    }
  | {
      kind: "padding_handle";
      node_id: NodeId;
      side: cmath.RectangleSide;
    };
