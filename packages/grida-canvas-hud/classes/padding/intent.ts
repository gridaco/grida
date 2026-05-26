// Padding — intent variant.
//
// `intent.ts` carries this named-class's contribution to the shared `Intent`
// union. `event/intent.ts` imports `PaddingIntent` and folds it into the
// union; consumers always pattern-match on the union as a whole.

import type cmath from "@grida/cmath";
import type { IntentPhase } from "../../event/intent";
import type { NodeId } from "../../event/gesture";

/**
 * Drag of a padding handle on a flex-parent container's side. The host
 * applies the new `value` to the node's `layout_padding_{side}` field.
 * When `mirror` is true (alt-held), host also applies the same value to
 * the opposite side; HUD paints both sides "selected" for the duration of
 * the gesture.
 *
 * The intent carries the resolved next padding value — not a pointer
 * delta. HUD owns the math; the host commits the outcome (D1).
 *
 * `value` is in doc-space units. The HUD clamps to 0 (no negative padding);
 * hosts wanting different clamps post-process.
 */
export type PaddingIntent = {
  kind: "padding_handle";
  node_id: NodeId;
  side: cmath.RectangleSide;
  value: number;
  mirror: boolean;
  phase: IntentPhase;
};
