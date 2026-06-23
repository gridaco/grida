// Transform-box — named-class chrome.
//
// What this draws — a four-corner quad (the box outline) plus invisible
// hit AABBs: 4 corner knobs (rotate), 4 side mid-edges (scale that side),
// and the body interior (translate). The quad outline is the only visible
// chrome in idle. Handles are transparent by default (Fitts'-reach via hit
// AABB > visible target).
//
// Anti-goals (what this class is NOT):
//
// - **Not an image-paint editor.** First consumer is image-fit; second
//   consumer is free-transform. The chrome doesn't know about either —
//   the host binds the box's `transform` to whatever field it owns.
// - **Not a shear/skew editor.** The reducer in
//   `primitives/transform-box.ts` doesn't model shear; adding handle
//   kinds here would be off-spec.
// - **Not a multi-touch transform.** Single pointer only; no two-finger
//   rotate. The HUD's gesture state assumes single-stream input.
// - **Not a host of handle styles.** Style tokens recolor; no per-handle
//   shape registry, no plugin slot for new handle kinds.
// - **Not undo-aware.** Host wraps `phase: "preview"` / `"commit"` in
//   its own history.
// - **No true original-direction scaling.** Inherited from the math
//   primitive's `applyScaling` TODO. Stays geometry-based until a host
//   needs it and pays for the work.

import cmath from "@grida/cmath";
import type { Rect } from "../../event/gesture";
import type {
  HitShape,
  OverlayElement,
  RenderShape,
} from "../../event/overlay";
import { docToScreen } from "../../event/transform";
import {
  decompose,
  getTransformBoxCorners,
} from "../../primitives/transform-box";
import type { HUDStyle } from "../../surface/style";
import type {
  TransformBoxActiveOp,
  TransformBoxHover,
  TransformBoxInput,
} from "./input";
import {
  TRANSFORM_BOX_BODY_PRIORITY,
  TRANSFORM_BOX_CORNER_HIT_SIZE,
  TRANSFORM_BOX_CORNER_PRIORITY,
  TRANSFORM_BOX_ROTATE_RING_HIT_SIZE,
  TRANSFORM_BOX_ROTATE_RING_PRIORITY,
  TRANSFORM_BOX_SIDE_HIT_THICKNESS,
  TRANSFORM_BOX_SIDE_PRIORITY,
} from "./priority";

const SIDES: readonly cmath.RectangleSide[] = [
  "top",
  "right",
  "bottom",
  "left",
];
const CORNERS: readonly cmath.IntercardinalDirection[] = [
  "nw",
  "ne",
  "se",
  "sw",
];

/**
 * Doc-space point → un-rotated pixel-space within the container. Used
 * by the gesture dispatcher to de-rotate doc-space cursor deltas before
 * feeding the math reducer.
 *
 * The "pixel-space" output is what `reduceTransformBox` expects for
 * its `delta` field — i.e. NOT box-local [0..size]; it's the un-
 * rotated pixel-space the math reducer operates in.
 */
export function docDeltaToBoxLocal(
  input: TransformBoxInput,
  doc_delta: cmath.Vector2
): cmath.Vector2 {
  const rotation = input.rotation ?? 0;
  if (rotation === 0) return doc_delta;
  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    doc_delta[0] * cos - doc_delta[1] * sin,
    doc_delta[0] * sin + doc_delta[1] * cos,
  ];
}

function rotatePixelToDoc(
  input: TransformBoxInput,
  pixel: cmath.Vector2
): cmath.Vector2 {
  const { origin, rotation = 0 } = input;
  if (rotation === 0) {
    return [pixel[0] + origin[0], pixel[1] + origin[1]];
  }
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    origin[0] + pixel[0] * cos - pixel[1] * sin,
    origin[1] + pixel[0] * sin + pixel[1] * cos,
  ];
}

/**
 * Project the 4 transform-box corners through the input pipeline
 * into doc-space. Returns them in NW/NE/SE/SW order.
 */
export function getTransformBoxDocCorners(input: TransformBoxInput): {
  nw: cmath.Vector2;
  ne: cmath.Vector2;
  se: cmath.Vector2;
  sw: cmath.Vector2;
} {
  const corners = getTransformBoxCorners(input.transform, input.size);
  return {
    nw: rotatePixelToDoc(input, corners.nw),
    ne: rotatePixelToDoc(input, corners.ne),
    se: rotatePixelToDoc(input, corners.se),
    sw: rotatePixelToDoc(input, corners.sw),
  };
}

function sideScreenEndpoints(
  screen_corners: Record<cmath.IntercardinalDirection, cmath.Vector2>,
  side: cmath.RectangleSide
): [cmath.Vector2, cmath.Vector2] {
  switch (side) {
    case "top":
      return [screen_corners.nw, screen_corners.ne];
    case "right":
      return [screen_corners.ne, screen_corners.se];
    case "bottom":
      return [screen_corners.sw, screen_corners.se];
    case "left":
      return [screen_corners.nw, screen_corners.sw];
  }
}

/**
 * Build the per-frame transform-box overlay primitives.
 *
 * Emits:
 *   - 1 quad outline (visible — `HUDPolyline` stroke).
 *   - 1 body hit polygon (invisible, fill transparent; intercepts events).
 *   - 4 corner hits (invisible 16×16 rects centered on each corner).
 *   - 4 side hit strips (invisible 12px-thick rotated rects along each side).
 */
export function buildTransformBox(input: {
  overlay: TransformBoxInput;
  style: HUDStyle;
  /** Reserved — handles are invisible today, so hover does not drive
   *  render. Kept on the contract for the eventual visible-handle
   *  variant (debug overlay, themed knobs). */
  hover: TransformBoxHover | null;
  transform: cmath.Transform;
  /** Reserved — see `hover`. */
  active_op?: TransformBoxActiveOp;
}): OverlayElement[] {
  const { overlay, style, transform } = input;

  const { id, group } = overlay;
  const corner_role = overlay.corner_role ?? "rotate";
  const body_priority = overlay.priority?.body ?? TRANSFORM_BOX_BODY_PRIORITY;
  const side_priority = overlay.priority?.side ?? TRANSFORM_BOX_SIDE_PRIORITY;
  const corner_priority =
    overlay.priority?.corner ?? TRANSFORM_BOX_CORNER_PRIORITY;
  const rotate_ring_priority =
    overlay.priority?.rotate ?? TRANSFORM_BOX_ROTATE_RING_PRIORITY;
  const out: OverlayElement[] = [];

  const doc_corners = getTransformBoxDocCorners(overlay);

  const inner_rotation_deg = decompose(overlay.transform).rotation;
  const base_angle =
    ((overlay.rotation ?? 0) + inner_rotation_deg) * (Math.PI / 180);

  const quad_points: ReadonlyArray<readonly [number, number]> = [
    [doc_corners.nw[0], doc_corners.nw[1]],
    [doc_corners.ne[0], doc_corners.ne[1]],
    [doc_corners.se[0], doc_corners.se[1]],
    [doc_corners.sw[0], doc_corners.sw[1]],
    [doc_corners.nw[0], doc_corners.nw[1]],
  ];

  const quad_render: RenderShape = {
    kind: "doc_polyline",
    points: quad_points,
    stroke: true,
    fill: false,
    color: style.transformBoxStroke,
    strokeWidth: style.selectionOutlineWidth,
  };

  // Project every corner once — body AABB and side endpoints both read
  // from this cache. 8 doc-corner→screen projections collapse to 4.
  const screen_corners: Record<cmath.IntercardinalDirection, cmath.Vector2> = {
    nw: docToScreen(transform, doc_corners.nw[0], doc_corners.nw[1]),
    ne: docToScreen(transform, doc_corners.ne[0], doc_corners.ne[1]),
    se: docToScreen(transform, doc_corners.se[0], doc_corners.se[1]),
    sw: docToScreen(transform, doc_corners.sw[0], doc_corners.sw[1]),
  };
  const body_hit_rect: Rect = cmath.rect.fromPoints([
    screen_corners.nw,
    screen_corners.ne,
    screen_corners.se,
    screen_corners.sw,
  ]);

  out.push({
    label: `transform_box_body:${id}`,
    group,
    action: { kind: "transform_box_body", id },
    hit: { kind: "screen_aabb", rect: body_hit_rect },
    render: quad_render,
    priority: body_priority,
    cursor: "move",
  });

  for (const side of SIDES) {
    const endpoints = sideScreenEndpoints(screen_corners, side);
    const [sax, say] = endpoints[0];
    const [sbx, sby] = endpoints[1];
    const mid: cmath.Vector2 = [(sax + sbx) / 2, (say + sby) / 2];
    const dx = sbx - sax;
    const dy = sby - say;
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    const angle = Math.atan2(dy, dx);

    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const inverse_transform: cmath.Transform = [
      [cos, -sin, mid[0] - cos * mid[0] + sin * mid[1]],
      [sin, cos, mid[1] - sin * mid[0] - cos * mid[1]],
    ];
    const hit_rect: Rect = {
      x: mid[0] - length / 2,
      y: mid[1] - TRANSFORM_BOX_SIDE_HIT_THICKNESS / 2,
      width: length,
      height: TRANSFORM_BOX_SIDE_HIT_THICKNESS,
    };
    const hit: HitShape = {
      kind: "screen_obb",
      rect: hit_rect,
      inverse_transform,
    };
    out.push({
      label: `transform_box_side:${id}:${side}`,
      group,
      action: { kind: "transform_box_side", id, side, base_angle },
      hit,
      priority: side_priority,
      cursor:
        side === "top" || side === "bottom"
          ? { kind: "resize", direction: "n", baseAngle: base_angle }
          : { kind: "resize", direction: "w", baseAngle: base_angle },
    });
  }

  for (const corner of CORNERS) {
    const p = doc_corners[corner];
    // Centered square hit at the corner, sized per role.
    const corner_hit = (size: number): HitShape => ({
      kind: "screen_rect_at_doc",
      anchor_doc: p,
      width: size,
      height: size,
      placement: "center",
    });
    if (corner_role === "scale") {
      // Outer rotate ring — a larger square around the corner, lower
      // precedence than the inner scale knob, so the corner's surround
      // rotates while its center scales (the standard design-tool corner).
      out.push({
        label: `transform_box_corner:${id}:${corner}`,
        group,
        action: { kind: "transform_box_corner", id, corner, base_angle },
        hit: corner_hit(TRANSFORM_BOX_ROTATE_RING_HIT_SIZE),
        priority: rotate_ring_priority,
        cursor: { kind: "rotate", corner, baseAngle: base_angle },
      });
      // Inner scale knob — wins the center over the ring.
      out.push({
        label: `transform_box_corner_scale:${id}:${corner}`,
        group,
        action: { kind: "transform_box_corner_scale", id, corner, base_angle },
        hit: corner_hit(TRANSFORM_BOX_CORNER_HIT_SIZE),
        priority: corner_priority,
        cursor: { kind: "resize", direction: corner, baseAngle: base_angle },
      });
    } else {
      out.push({
        label: `transform_box_corner:${id}:${corner}`,
        group,
        action: { kind: "transform_box_corner", id, corner, base_angle },
        hit: corner_hit(TRANSFORM_BOX_CORNER_HIT_SIZE),
        priority: corner_priority,
        cursor: { kind: "rotate", corner, baseAngle: base_angle },
      });
    }
  }

  return out;
}
