// Inlined pure draw routine for the built-in corner-radius chrome.
//
// Why a pure function, not a class — mirrors the precedent set by
// `pixel-grid.ts` and `ruler.ts`:
// - The HUD already owns the canvas, the DPR, the camera transform, and
//   the per-frame paint loop. A class re-introducing canvas ownership
//   inside the HUD would duplicate `HUDCanvas`.
// - Per the package README ("Not a renderer"), the HUD inlines small
//   pure draw routines for canonical built-in chrome instead of taking
//   on stateful renderer classes.
//
// What this draws — knobs the user grabs to edit a node's corner radii.
// Each knob's POSITION is the **arc center** of the rounded corner it
// represents: at radius `r`, the knob sits offset by `r` in both x and
// y from the corner (toward the rect's interior). Travel direction is
// the corner's intercardinal diagonal, NOT the corner→rect-center
// vector. This is the geometric truth — the knob IS where the corner
// arc's center lies.
//
// Geometry — host-supplied via `CornerRadiusInput`. Two shapes:
//   - `rect` — four knobs, each travelling at 45° from its corner. The
//     maximum radius is `min(w, h) / 2` (the closest-edge half) — past
//     that, adjacent arcs overlap. For an oblong rect at max, the
//     handle pairs along the SHORTER axis collapse (TL/BL coincide;
//     TR/BR coincide) and the user sees TWO knobs, not four. For a
//     square at max, all four collapse to ONE knob at the center.
//   - `line` — one knob, travelling along an a→b segment (e.g. one
//     tooth of a star/gear). `a` is radius-zero; `b` is saturation.
//
// Padded start — the handle's RENDERED position is floored to a
// screen-px inset from the corner so it never collides with the resize
// knob that sits AT the corner. DURING a gesture the floor is lifted
// (the handle follows the cursor and may sit AT the corner). On
// commit, the next paint re-floors — the handle "snaps back" to a
// grabbable position.
//
// Coincidence groups — when handles share a position (oblong max,
// square max), the surface registers ONE hit region for the group
// instead of N. The state machine resolves which corner the user
// meant from the drag direction after a small threshold, picking
// AMONG the group's candidates. See `cornerRadiusLayoutGroups`.
//
// Paint slot — ABOVE selection chrome and host extras (a handle, not a
// frame) and BELOW the ruler. Same band as resize/rotate handles.

import cmath from "@grida/cmath";
import type { Rect, NodeId } from "../event/gesture";
import {
  computeParametricHandleLayout,
  type ParametricHandleInput,
} from "./parametric-handle";

/**
 * Screen-px inset of the handle's RESTING position from its anchoring
 * corner (rect) or endpoint (line).
 *
 * The handle is floored to this distance whenever no gesture is in
 * flight, so a radius=0 knob still sits inside the rect — visible and
 * grabbable, not occluded by the resize-corner knob. During a gesture
 * the floor is lifted: position follows the cursor.
 *
 * Locked, not configurable. Per `/sdk-design`: "core, not customizable."
 */
export const DEFAULT_CORNER_RADIUS_HANDLE_INSET = 16;

/** Default screen-px size of the knob. Matches the visual size of
 *  resize-corner knobs by convention. */
export const DEFAULT_CORNER_RADIUS_HANDLE_SIZE = 8;

/** Default screen-px hit-rect size. Padded above the visual knob per
 *  the package's render/hit asymmetry rule. */
export const DEFAULT_CORNER_RADIUS_HIT_SIZE = 16;

/**
 * Distance (in doc-space px) within which two handle positions count
 * as "coincident." Used by `cornerRadiusLayoutGroups` to group
 * overlapping handles. 0.5 doc-px is generous for floating-point
 * noise; coincidence is otherwise a clean geometric event (radii
 * reach `min(w, h) / 2`).
 */
const COINCIDENCE_EPS_DOC = 0.5;

/**
 * One of the four named corners of a rect. Matches the package's
 * existing `IntercardinalDirection` convention used by resize handles.
 */
export type CornerRadiusAnchor = "nw" | "ne" | "se" | "sw";

/**
 * Per-corner rectangular radius. Hosts populate all four — even
 * "all-uniform" rounded rects pass `{ tl, tr, br, bl }` with the same
 * value. The HUD never assumes uniformity; the surface dedup-collapses
 * geometrically (when handles coincide) rather than value-checking.
 */
export interface CornerRadiusRectangular {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

/**
 * Public input handed to `surface.setCornerRadius(...)`.
 *
 * - `rect` ↔ `CornerRadiusRectangular` (four per-corner values, each
 *   knob travels at 45° from its corner; max radius `min(w,h)/2`).
 * - `line` ↔ `{ value }` (one radius, knob travels along a→b).
 *
 * Illegal combinations (uniform-on-rect, rectangular-on-line) are
 * unreachable by type.
 */
export type CornerRadiusInput =
  | {
      node_id: NodeId;
      geometry: {
        kind: "rect";
        /** Rect in LOCAL space (axis-aligned). When `transform` is
         *  omitted, "local" and "doc" coincide and the rect is the
         *  doc-space AABB. */
        rect?: Rect;
        /**
         * Optional local → doc transform (2×3 affine). When set,
         * handle positions are computed in local space (the four
         * intercardinal diagonals from each corner) and then
         * transformed into doc space — so rotated rects show their
         * knobs along the ROTATED diagonals, not the doc-axis ones.
         * Pure rotation (orthonormal) is the supported common case;
         * non-orthonormal transforms work for rendering but are
         * untested for the gesture's projection math.
         */
        transform?: cmath.Transform;
      };
      radius: CornerRadiusRectangular;
    }
  | {
      node_id: NodeId;
      geometry: { kind: "line"; a: cmath.Vector2; b: cmath.Vector2 };
      radius: { value: number };
    };

// ─── Layout — pure math, no canvas ────────────────────────────────────────

/**
 * One handle the producer wants on screen: the doc-space anchor it
 * sits at (so the camera moves it with the document), the screen-px
 * size of the knob and its hit AABB, and a stable label identifying
 * which interaction it triggers.
 *
 * `anchor` is `"nw" | "ne" | "se" | "sw"` for per-corner rect handles,
 * `"line"` for line geometry. The surface owns the coincidence
 * collapsing (and `cornerRadiusLayoutGroups` exposes the grouping
 * predicate); the pure layout always returns one entry per corner.
 */
export interface CornerRadiusHandleLayout {
  /** Doc-space anchor — projected through the camera each frame. */
  pos: cmath.Vector2;
  /** Screen-px visual knob size. */
  size: number;
  /** Screen-px hit AABB size (>= size, padded per Fitts'). */
  hit_size: number;
  /** `nw/ne/se/sw` for per-corner rect handles, `"line"` for line. */
  anchor: CornerRadiusAnchor | "line";
  /** Stable identifier — `"corner_radius:<anchor>"` or
   *  `"corner_radius:line"`. */
  label: string;
}

/**
 * Sign of the intercardinal direction from a corner toward the rect's
 * interior. NW corner → (+1, +1); NE → (-1, +1); SE → (-1, -1);
 * SW → (+1, -1). The handle travels in this direction from the corner
 * by `r` in BOTH x and y.
 */
export function cornerRadiusAnchorSign(
  anchor: CornerRadiusAnchor
): readonly [-1 | 1, -1 | 1] {
  switch (anchor) {
    case "nw":
      return [1, 1];
    case "ne":
      return [-1, 1];
    case "se":
      return [-1, -1];
    case "sw":
      return [1, -1];
  }
}

/**
 * Compute the handle position for one corner of a rect.
 *
 * The math — the handle IS the arc center of the rounded corner:
 *
 *   reach      = radius                            (during gesture)
 *   reach      = max(radius, pad_screen / zoom)    (at rest / commit)
 *   reach_cap  = min(w, h) / 2                     (closest-edge half)
 *   reach      = clamp(reach, 0, reach_cap)
 *   handle     = corner + (sign_x · reach, sign_y · reach)
 *
 * `reach` is the doc-space distance the arc center sits from the
 * corner along EACH axis (x AND y). For a square at max, all four
 * arc centers land at the rect's center. For an oblong at max
 * (reach = min(w,h)/2), pairs along the SHORTER axis coincide:
 *
 *   - w > h: TL/BL share `(r, h/2)`; TR/BR share `(w-r, h/2)`
 *   - h > w: TL/TR share `(w/2, r)`; BL/BR share `(w/2, h-r)`
 *
 * `during_gesture` lifts the padded floor: the handle can sit AT the
 * corner at radius=0. After release the floor is re-applied and the
 * handle snaps back to a grabbable position.
 *
 * `zoom` is the camera's uniform scale (`transform[0][0]`); pass `1`
 * for unit tests against doc-space math.
 */
export function cornerRadiusHandlePosRect(
  rect: Rect,
  anchor: CornerRadiusAnchor,
  radius: number,
  zoom: number,
  opts: {
    pad?: number;
    during_gesture?: boolean;
    transform?: cmath.Transform;
  } = {}
): cmath.Vector2 {
  // Build a single-handle input matching THIS anchor's segment and run
  // it through `computeParametricHandleLayout`. The per-axis pad (in
  // screen-px) becomes `pad · √2 / zoom` along the curve — the
  // diagonal track at 45° turns one axis-aligned pixel into √2 along
  // the segment, and zoom converts screen-px to doc-units (= the
  // track's units).
  const pad = opts.pad ?? DEFAULT_CORNER_RADIUS_HANDLE_INSET;
  const max = Math.min(rect.width, rect.height) / 2;
  const corners: Record<CornerRadiusAnchor, cmath.Vector2> = {
    nw: [rect.x, rect.y],
    ne: [rect.x + rect.width, rect.y],
    se: [rect.x + rect.width, rect.y + rect.height],
    sw: [rect.x, rect.y + rect.height],
  };
  const [cx, cy] = corners[anchor];
  const [sx, sy] = cornerRadiusAnchorSign(anchor);
  const input: ParametricHandleInput = {
    node_id: "_",
    handles: [
      {
        id: anchor,
        track: {
          kind: "segment",
          a: [cx, cy],
          b: [cx + sx * max, cy + sy * max],
        },
        value: radius,
        domain: { min: 0, max },
        inset: (pad * Math.SQRT2) / Math.max(zoom, 1e-6),
      },
    ],
    transform: opts.transform,
  };
  const layout = computeParametricHandleLayout(input, {
    during_gesture: opts.during_gesture,
  });
  return layout[0]?.pos ?? [cx, cy];
}

/**
 * Compute the handle position along a line's `a → b` axis. Single
 * handle for `line` geometry; same gesture-aware padding rule as the
 * rect case. The saturation cap is `dist(a, b)`.
 *
 * The track here is the a→b segment of arbitrary direction, so the
 * per-axis convention used by the rect case doesn't apply — `pad`
 * converts to track-units as `pad / zoom`.
 */
export function cornerRadiusHandlePosLine(
  a: cmath.Vector2,
  b: cmath.Vector2,
  radius: number,
  zoom: number,
  opts: { pad?: number; during_gesture?: boolean } = {}
): cmath.Vector2 {
  const pad = opts.pad ?? DEFAULT_CORNER_RADIUS_HANDLE_INSET;
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (dist === 0) return [a[0], a[1]];
  const input: ParametricHandleInput = {
    node_id: "_",
    handles: [
      {
        id: "line",
        track: { kind: "segment", a: [a[0], a[1]], b: [b[0], b[1]] },
        value: radius,
        domain: { min: 0, max: dist },
        inset: pad / Math.max(zoom, 1e-6),
      },
    ],
  };
  const layout = computeParametricHandleLayout(input, {
    during_gesture: opts.during_gesture,
  });
  return layout[0]?.pos ?? [a[0], a[1]];
}

/**
 * Compose a rect's four corner-radius parameters into a hud-side
 * `ParametricHandleInput`: four `segment` tracks (one per corner,
 * inward intercardinal direction, length `min(w, h) / 2`), declared
 * as one direction-resolved coincidence group.
 *
 * `inset` is the snap-back floor measured ALONG the track, in
 * track-units. The caller converts its preferred screen-px convention
 * to track-units (`pad · √2 / zoom` for the diagonal track).
 *
 * Local helper. Math layer (`cmath.parametric`) holds the primitives
 * (`ParametricHandle`, `ParametricHandleSet`); use-case composers
 * like this one live next to their caller.
 */
function cornerRadiusHandles(
  node_id: NodeId,
  rect: Rect,
  radii: { tl: number; tr: number; br: number; bl: number },
  inset: number,
  transform?: cmath.Transform
): ParametricHandleInput {
  const max = Math.min(rect.width, rect.height) / 2;
  type Spec = {
    id: CornerRadiusAnchor;
    corner: cmath.Vector2;
    value: number;
  };
  const specs: Spec[] = [
    { id: "nw", corner: [rect.x, rect.y], value: radii.tl },
    {
      id: "ne",
      corner: [rect.x + rect.width, rect.y],
      value: radii.tr,
    },
    {
      id: "se",
      corner: [rect.x + rect.width, rect.y + rect.height],
      value: radii.br,
    },
    {
      id: "sw",
      corner: [rect.x, rect.y + rect.height],
      value: radii.bl,
    },
  ];
  const handles = specs.map(({ id, corner, value }) => {
    const [sx, sy] = cornerRadiusAnchorSign(id);
    return {
      id,
      track: {
        kind: "segment" as const,
        a: corner,
        b: [corner[0] + sx * max, corner[1] + sy * max] as cmath.Vector2,
      },
      value,
      domain: { min: 0, max },
      inset,
    };
  });
  return {
    node_id,
    handles,
    groups: [{ ids: ["nw", "ne", "se", "sw"], policy: "direction-resolved" }],
    transform,
  };
}

/**
 * Compute the layout for the corner-radius handles of one input.
 *
 * Pure: same inputs → same handles. No camera reads, no DOM.
 *
 * - `rect` geometry → 4 handles in `nw/ne/se/sw` declaration order.
 *   The center coincidence collapse is a downstream concern of the
 *   surface (which registers one hit region per coincidence group)
 *   and the renderer (which dedup-paints overlapping circles). The
 *   pure layout stays four-entry so consumers can inspect per-corner
 *   positions.
 * - `line` geometry → 1 handle labelled `corner_radius:line`.
 *
 * `during_gesture` flips the handle position from "floored to padded
 * inset" (at rest / on commit) to "raw radius value" (during drag).
 * The surface passes `true` when its gesture machine is in a
 * `corner_radius` state, `false` otherwise.
 */
export function computeCornerRadiusLayout(
  input: CornerRadiusInput,
  fallback_rect: Rect | null,
  zoom: number,
  opts: {
    size?: number;
    hit_size?: number;
    pad?: number;
    during_gesture?: boolean;
  } = {}
): CornerRadiusHandleLayout[] {
  // Composes onto the universal parametric primitive: the local
  // `cornerRadiusHandles` helper builds the 4-handle input for the
  // rect case; the line case constructs a single-segment input
  // inline. The public types — `CornerRadiusInput`,
  // `CornerRadiusHandleLayout`, the four anchor labels — are
  // unchanged.
  const size = opts.size ?? DEFAULT_CORNER_RADIUS_HANDLE_SIZE;
  const hit_size = opts.hit_size ?? DEFAULT_CORNER_RADIUS_HIT_SIZE;
  const pad = opts.pad ?? DEFAULT_CORNER_RADIUS_HANDLE_INSET;
  const during_gesture = opts.during_gesture ?? false;

  // Convert the screen-px `pad` to track-units once per call. The
  // rect case rides 45° diagonals (`pad · √2 / zoom`); the line case
  // rides an arbitrary-direction segment (`pad / zoom`).
  const zoom_safe = Math.max(zoom, 1e-6);

  if (input.geometry.kind === "line") {
    const a = input.geometry.a;
    const b = input.geometry.b;
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const parametric_input: ParametricHandleInput = {
      node_id: "_",
      handles: [
        {
          id: "line",
          track: { kind: "segment", a: [a[0], a[1]], b: [b[0], b[1]] },
          value: (input.radius as { value: number }).value,
          domain: { min: 0, max: dist },
          inset: pad / zoom_safe,
        },
      ],
    };
    const layout = computeParametricHandleLayout(parametric_input, {
      size,
      hit_size,
      during_gesture,
    });
    if (layout.length === 0) return [];
    return [
      {
        pos: layout[0].pos,
        size,
        hit_size,
        anchor: "line",
        label: "corner_radius:line",
      },
    ];
  }

  const rect = input.geometry.rect ?? fallback_rect;
  if (!rect) return [];

  const r = input.radius as CornerRadiusRectangular;
  const inset_track = (pad * Math.SQRT2) / zoom_safe;
  const parametric_input = cornerRadiusHandles(
    "_",
    rect,
    { tl: r.tl, tr: r.tr, br: r.br, bl: r.bl },
    inset_track,
    input.geometry.transform
  );
  const layout = computeParametricHandleLayout(parametric_input, {
    size,
    hit_size,
    during_gesture,
  });
  // Map parametric handles back to corner-radius layouts by handle_id
  // (the composer uses the same `"nw" | "ne" | "se" | "sw"` ids the
  // public corner-radius API names).
  const id_to_anchor: Record<string, CornerRadiusAnchor> = {
    nw: "nw",
    ne: "ne",
    se: "se",
    sw: "sw",
  };
  return layout.map((l) => {
    const anchor = id_to_anchor[l.handle_id] ?? "nw";
    return {
      pos: l.pos,
      size,
      hit_size,
      anchor,
      label: `corner_radius:${anchor}`,
    };
  });
}

/**
 * Group the four rect handle entries by doc-space coincidence (within
 * `eps_doc`). Returns one group per distinct position, in nw/ne/se/sw
 * iteration order. Each inner array is the list of anchors sharing
 * that position.
 *
 * Geometric truth:
 *   - sub-max (each radius < min(w,h)/2)  →  4 groups, one per corner
 *   - oblong max (w > h, each radius = h/2)  →  2 groups:
 *       [['nw','sw'], ['ne','se']]     (left pair, right pair)
 *   - oblong max (h > w, each radius = w/2)  →  2 groups:
 *       [['nw','ne'], ['sw','se']]     (top pair, bottom pair)
 *   - square max (each radius = w/2 = h/2)  →  1 group:
 *       [['nw','ne','se','sw']]         (all at the center)
 *
 * Returns `[]` for non-rect layouts (line geometry — there's no
 * notion of multi-corner coincidence on a single-handle layout).
 */
export function cornerRadiusLayoutGroups(
  layout: readonly CornerRadiusHandleLayout[],
  eps_doc: number = COINCIDENCE_EPS_DOC
): CornerRadiusAnchor[][] {
  if (layout.length !== 4) return [];
  const groups: { pos: cmath.Vector2; anchors: CornerRadiusAnchor[] }[] = [];
  for (const h of layout) {
    if (h.anchor === "line") return [];
    const found = groups.find(
      (g) =>
        Math.abs(g.pos[0] - h.pos[0]) <= eps_doc &&
        Math.abs(g.pos[1] - h.pos[1]) <= eps_doc
    );
    if (found) found.anchors.push(h.anchor);
    else groups.push({ pos: h.pos, anchors: [h.anchor] });
  }
  return groups.map((g) => g.anchors);
}

/**
 * Resolve a drag's direction to the anchor whose intercardinal
 * direction `(sign_x, sign_y)` best matches the drag delta.
 *
 * Used when a coincidence group has more than one candidate
 * (oblong max — 2 candidates; square max — 4 candidates). Picks
 * AMONG `candidates` only — never invents a corner outside the
 * group. Tie-break: first listed candidate wins.
 *
 * `dx, dy` is the drag delta (cursor moved by). The user pulls the
 * handle TOWARD the corner the radius will shrink at — so the drag
 * direction matches `(sign_x, sign_y)` directly (TL knob exists at
 * (r, r); pulling toward TL means cursor moves in (-x, -y); but
 * that's the SAME as cursor moves "back along the (sign_x, sign_y)
 * direction" which means delta · sign is negative). To keep the
 * intent intuitive — "pulling toward NW selects NW" — we pick the
 * candidate whose `(sign_x, sign_y)` minimizes the dot product
 * (i.e. delta most opposite the corner→interior vector).
 *
 * Equivalent (and what the code does): maximize the dot product
 * with the NEGATED delta.
 */
export function resolveCornerDragAnchor(
  dx: number,
  dy: number,
  candidates: readonly CornerRadiusAnchor[]
): CornerRadiusAnchor {
  let best: CornerRadiusAnchor = candidates[0];
  let best_dot = -Infinity;
  for (const anchor of candidates) {
    const [sx, sy] = cornerRadiusAnchorSign(anchor);
    const dot = sx * -dx + sy * -dy;
    if (dot > best_dot) {
      best_dot = dot;
      best = anchor;
    }
  }
  return best;
}

// Backwards-compat alias kept under the old name during the rename.
// The new spelling is `resolveCornerDragAnchor`.
/** @deprecated use `resolveCornerDragAnchor`. */
export function resolveCenterDragAnchor(
  dx: number,
  dy: number
): CornerRadiusAnchor {
  return resolveCornerDragAnchor(dx, dy, ["nw", "ne", "se", "sw"]);
}

// ─── drawCornerRadius — the pure painter ──────────────────────────────────

export interface DrawCornerRadiusParams {
  ctx: CanvasRenderingContext2D;
  transform: cmath.Transform;
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
  /** Device pixel ratio of the canvas. */
  dpr: number;
  /** Pre-computed handle layout. Always one entry per corner (rect)
   *  or one entry (line); the painter dedups by screen-pixel so
   *  coincident handles paint as one circle. */
  handles: readonly CornerRadiusHandleLayout[];
  /** Stroke + fill color for the knob. */
  color: string;
  /** Fill color for the interior. Falls back to white for the standard
   *  hollow-ring look. */
  fillColor?: string;
}

/**
 * Paint corner-radius handles into the canvas context. Stateless.
 *
 * Coincident handles are dedup-painted at integer-pixel granularity:
 * when multiple entries project to the same pixel (oblong-max pairs,
 * square-max quadruple) only one circle is drawn. The deduplication
 * mirrors `cornerRadiusLayoutGroups` — same geometric truth, two
 * different consumers.
 */
export function drawCornerRadius(p: DrawCornerRadiusParams): void {
  const { ctx, transform, dpr, handles, color, fillColor = "#ffffff" } = p;
  if (handles.length === 0) return;
  const [[sx, , tx], [, sy, ty]] = transform;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = fillColor;

  const painted = new Set<string>();
  for (const h of handles) {
    const scrX = sx * h.pos[0] + tx;
    const scrY = sy * h.pos[1] + ty;
    const key = `${Math.round(scrX)}:${Math.round(scrY)}`;
    if (painted.has(key)) continue;
    painted.add(key);
    const r = h.size / 2;
    ctx.beginPath();
    ctx.ellipse(scrX, scrY, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
  void p.width;
  void p.height;
}
