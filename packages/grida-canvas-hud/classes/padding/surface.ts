// Padding — named-class chrome.
//
// What this draws — four inset side rects (only the sides whose value > 0)
// with a diagonal-stripe hover/selected fill, plus four mid-edge drag
// handles for resizing each side.
//
// Anti-goals (what this class is NOT):
//
// - **Not a layout engine.** This class draws chrome over a host-owned
//   padding value; it does not compute layout, push children, or know about
//   flex / grid semantics. The host commits the new padding; the host's
//   layout pipeline recomputes children.
// - **Not a padding-style picker.** No per-corner radii, no per-side
//   stroke style, no opacity-per-side. The model is four scalars.
// - **Not a multi-rect padding model.** One container per input. Hosts
//   with N flex parents push N inputs (the class scales by `id`).
// - **Not a gap chrome.** Gap (spacing between children) is a different
//   model — different geometry (N-1 dividers between siblings, not 4 sides
//   of one rect). See the doctrine's gap/sort iter for the audit.
// - **Not undo-aware.** Intents stream `phase: "preview"`; host wraps in
//   its own history.

import cmath from "@grida/cmath";
import type { OverlayElement, RenderShape } from "../../event/overlay";
import { MIN_HIT_SIZE } from "../../event/overlay";
import type { Rect } from "../../event/gesture";
import { docRectToScreenAABB } from "../../primitives/projection";
import type { HUDStyle } from "../../surface/style";
import type { PaddingHover, PaddingOverlayInput } from "./input";
import {
  PADDING_HANDLE_LENGTH,
  PADDING_HANDLE_PRIORITY,
  PADDING_HANDLE_THICKNESS,
  PADDING_REGION_PRIORITY,
} from "./priority";

const SIDES: readonly cmath.RectangleSide[] = [
  "top",
  "right",
  "bottom",
  "left",
];

/**
 * Build per-side inset rect (doc-space) for one side of a container
 * rect. Returns `null` when the side has no padding (value <= 0).
 *
 * The geometry mirrors [surface-padding-overlay.tsx:58–123] — top
 * occupies the full container width across `padding.top`; right
 * occupies the full container height across the right padding strip;
 * bottom/left symmetric.
 */
export function paddingSideRect(
  rect: Rect,
  padding: PaddingOverlayInput["padding"],
  side: cmath.RectangleSide
): Rect | null {
  const top = padding.top ?? 0;
  const right = padding.right ?? 0;
  const bottom = padding.bottom ?? 0;
  const left = padding.left ?? 0;
  switch (side) {
    case "top":
      return top > 0
        ? { x: rect.x, y: rect.y, width: rect.width, height: top }
        : null;
    case "right":
      return right > 0
        ? {
            x: rect.x + rect.width - right,
            y: rect.y,
            width: right,
            height: rect.height,
          }
        : null;
    case "bottom":
      return bottom > 0
        ? {
            x: rect.x,
            y: rect.y + rect.height - bottom,
            width: rect.width,
            height: bottom,
          }
        : null;
    case "left":
      return left > 0
        ? { x: rect.x, y: rect.y, width: left, height: rect.height }
        : null;
  }
}

function sideHandleAnchor(side_rect: Rect): cmath.Vector2 {
  return [
    side_rect.x + side_rect.width / 2,
    side_rect.y + side_rect.height / 2,
  ];
}

/**
 * Build the per-frame padding overlay primitives.
 *
 * Emits one `OverlayElement` per side rect (hover-only, no intent) and
 * one per drag handle (per-side `padding_handle` action). The two are
 * keyed by side and share the same semantic `group`.
 *
 * Paint resolution:
 *   - idle → no render (transparent body; hit still active)
 *   - hover → `style.paddingHoverPaint`
 *   - selected (= side === active_side, OR alt and side === opposite of
 *     active_side) → outline stroke (no stripe)
 *
 * The drag handles are suppressed while any padding drag is in flight —
 * don't paint knobs the user can't grab.
 *
 * The region's hit shape is pre-projected to **screen-space AABB** here
 * — `transform` is needed so the hit area scales with zoom.
 */
export function buildPaddingOverlay(input: {
  overlay: PaddingOverlayInput;
  style: HUDStyle;
  hover: PaddingHover | null;
  alt_held: boolean;
  transform: cmath.Transform;
  active_side?: cmath.RectangleSide;
}): OverlayElement[] {
  const { overlay, style, hover, alt_held, transform, active_side } = input;
  const { node_id, rect, padding, group } = overlay;
  const out: OverlayElement[] = [];

  const hover_on_this_node = hover !== null && hover.node_id === node_id;
  const hover_opposite_side = hover
    ? cmath.rect.getOppositeSide(hover.side)
    : null;
  const active_opposite_side = active_side
    ? cmath.rect.getOppositeSide(active_side)
    : null;
  const drag_in_flight = active_side !== undefined;

  for (let i = 0; i < SIDES.length; i++) {
    const side = SIDES[i];
    const side_rect = paddingSideRect(rect, padding, side);
    if (!side_rect) continue;

    const hover_targets_this = hover_on_this_node && hover!.side === side;
    const is_mirror_hover =
      alt_held && hover_on_this_node && hover_opposite_side === side;
    const is_selected =
      active_side !== undefined &&
      (active_side === side || (alt_held && active_opposite_side === side));

    const points: ReadonlyArray<readonly [number, number]> = [
      [side_rect.x, side_rect.y],
      [side_rect.x + side_rect.width, side_rect.y],
      [side_rect.x + side_rect.width, side_rect.y + side_rect.height],
      [side_rect.x, side_rect.y + side_rect.height],
      [side_rect.x, side_rect.y],
    ];
    const render: RenderShape | undefined = is_selected
      ? {
          kind: "doc_polyline",
          points,
          stroke: true,
          fill: false,
          color: style.paddingSelectedStroke,
          strokeWidth: style.selectionOutlineWidth,
        }
      : hover_targets_this || is_mirror_hover
        ? {
            kind: "doc_polyline",
            points,
            stroke: false,
            fill: true,
            fillPaint: style.paddingHoverPaint,
          }
        : undefined;

    out.push({
      label: `padding_region:${side}`,
      group,
      action: { kind: "padding_region", node_id, side },
      hit: {
        kind: "screen_aabb",
        rect: docRectToScreenAABB(side_rect, transform),
      },
      render,
      priority: PADDING_REGION_PRIORITY,
      cursor: "pointer",
    });

    if (drag_in_flight) continue;

    const anchor = sideHandleAnchor(side_rect);
    const is_horizontal = side === "top" || side === "bottom";
    const w = is_horizontal ? PADDING_HANDLE_LENGTH : PADDING_HANDLE_THICKNESS;
    const h = is_horizontal ? PADDING_HANDLE_THICKNESS : PADDING_HANDLE_LENGTH;

    out.push({
      label: `padding_handle:${side}`,
      group,
      action: {
        kind: "padding_handle",
        node_id,
        side,
        rect,
        initial_value: padding[side] ?? 0,
      },
      hit: {
        kind: "screen_rect_at_doc",
        anchor_doc: anchor,
        width: Math.max(w, MIN_HIT_SIZE),
        height: Math.max(h, MIN_HIT_SIZE),
        placement: "center",
      },
      render: {
        kind: "screen_rect",
        anchor_doc: anchor,
        width: w,
        height: h,
        placement: "center",
        fill: true,
        stroke: true,
        fillColor: style.paddingHandleFill,
        strokeColor: style.paddingHandleStroke,
      },
      priority: PADDING_HANDLE_PRIORITY,
      cursor: is_horizontal
        ? { kind: "resize", direction: "n" }
        : { kind: "resize", direction: "w" },
    });
  }

  return out;
}

/**
 * Project a cursor's doc-space position to a new padding value for
 * `side`, given the container rect. Clamps to `[0, container_size_on_axis]`.
 *
 * **The handle is anchored at the CENTER of the side rect** (e.g. top
 * handle sits at `y = padding.top / 2`). For the visual handle to track
 * the cursor 1:1 during a drag, the padding value must change at 2× the
 * cursor displacement: handle position = padding / 2, so padding =
 * 2 × handle position from rect edge.
 *
 * Concretely (per side):
 *
 *   - `top`     → value = 2 × (cursor_y - rect.y)
 *   - `right`   → value = 2 × ((rect.x + rect.width) - cursor_x)
 *   - `bottom`  → value = 2 × ((rect.y + rect.height) - cursor_y)
 *   - `left`    → value = 2 × (cursor_x - rect.x)
 *
 * Click-no-drag check: at `cursor = handle_center = initial / 2`,
 * `value = 2 × (initial / 2) = initial`. ✓
 *
 * Used by the `padding_handle` gesture in `event/state.ts`.
 */
export function projectPaddingValue(
  rect: Rect,
  side: cmath.RectangleSide,
  cursor_doc: cmath.Vector2
): number {
  let v: number;
  let max: number;
  switch (side) {
    case "top":
      v = 2 * (cursor_doc[1] - rect.y);
      max = rect.height;
      break;
    case "right":
      v = 2 * (rect.x + rect.width - cursor_doc[0]);
      max = rect.width;
      break;
    case "bottom":
      v = 2 * (rect.y + rect.height - cursor_doc[1]);
      max = rect.height;
      break;
    case "left":
      v = 2 * (cursor_doc[0] - rect.x);
      max = rect.width;
      break;
  }
  if (v < 0) return 0;
  if (v > max) return max;
  return v;
}
