// Pure-geometry model for selection-control chrome.
//
// One file owns three things, so the UX rule is reviewable without
// grepping across the package:
//
//   1. The priority ladder ({@link HUDHitPriority}) — lower wins.
//   2. The named breakpoints (screen-px) that drive priority promotions
//      on the **body ↔ perimeter** boundary (where body still overlaps
//      with the perimeter ring straddling the bbox edge).
//   3. {@link computeSelectionControlLayout} — pure function from
//      `(rect_screen, opts) → SelectionControlLayout`. Uses a 9-slice
//      negotiation: per-axis, the 8 perimeter slots (4 corners + 4
//      edges) divide the perimeter length with side strips guaranteeing
//      their min length and corners shrinking to give them room. No
//      overlaps among the 8 perimeter zones — it's a true partition.
//
// The chrome builder is a thin consumer: it asks for the layout and fans
// each zone into one `OverlayElement`. No size-branching, no magic
// numbers, no iteration-order priority.

import cmath from "@grida/cmath";
import type { Rect } from "./gesture";
import type { RotationCorner } from "./cursor";
import {
  MIN_HIT_SIZE,
  MIN_CHROME_VISIBLE_SIZE,
  ROTATION_WRAP,
} from "./overlay";

// Hoisted to avoid per-frame allocations — `computeSelectionControlLayout`
// runs once per selection per frame.
const CORNER_DIRS = ["nw", "ne", "se", "sw"] as const;
const EDGE_DIRS = ["n", "e", "s", "w"] as const;
const CORNER_LABEL = {
  nw: "resize_handle:nw",
  ne: "resize_handle:ne",
  se: "resize_handle:se",
  sw: "resize_handle:sw",
} as const;
const EDGE_LABEL = {
  n: "resize_edge:n",
  e: "resize_edge:e",
  s: "resize_edge:s",
  w: "resize_edge:w",
} as const;
const ROTATE_LABEL = {
  nw: "rotate:nw",
  ne: "rotate:ne",
  se: "rotate:se",
  sw: "rotate:sw",
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Priority ladder (lower wins)
//
// Numeric values are intentionally spread so future zone types
// (annotations, comments, ports, snap markers) can land between existing
// tiers without renumbering. Priority resolves overlaps where they
// exist (body ↔ perimeter, edge ↔ body in promoted modes); within the
// perimeter ring itself the zones are mutually exclusive by geometry, so
// priority is only a 1-px boundary tie-break there.
// ────────────────────────────────────────────────────────────────────────────

export const HUDHitPriority = {
  /** Line endpoints — sole resize affordance on lines; nothing outranks them. */
  ENDPOINT_HANDLE: 10,

  /** Edge priority when promoted (parallel axis violated). Edge strip
   *  extends into the body interior on the perpendicular axis when that
   *  axis is comfortable; in that case the edge must outrank the
   *  (also-promoted) body to keep the resize affordance. */
  RESIZE_HANDLE_EDGE_SMALL: 22,

  /** Body priority when promoted (any axis violated). Lets the user drag
   *  from anywhere inside small selections (instead of the corner
   *  extension stealing the interior). */
  TRANSLATE_BODY_SMALL: 25,

  /** Side resize handles (N/S/W/E). Lower than corner so that on the 1-px
   *  shared boundary between an edge strip and an adjacent corner slot,
   *  edge wins ("sides take priority over corners"). */
  RESIZE_HANDLE_EDGE: 30,

  /** Corner resize handles (NW/NE/SE/SW). */
  RESIZE_HANDLE_CORNER: 31,

  /** Translate-body — default value. */
  TRANSLATE_BODY: 40,

  /** Rotation halo wraps each resize corner — the rotation hit rect
   *  overlaps body, edges, and the resize corner itself, but has the
   *  LOWEST priority of any selection-control zone. It only "wins"
   *  (becomes the topmost hit) where no other affordance claims the
   *  pixel: the L-strip immediately outside the resize-corner outer
   *  edges. This is what gives rotation a gap-free wrap around the
   *  corner with zero pixel-overlap on the cursor, without ever
   *  intruding on the body, the edge resize strips, or the corner
   *  resize knob. Do not place anything below this. */
  ROTATE_HANDLE: 50,
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Principle and derived constants
//
// One tunable: `MIN_GUARANTEED_INTERACTIVE_DIM`. Two derivations.
//
// (1) Perimeter negotiation — per axis the 8 perimeter slots split a 1D
//     run of length `axis_dim + 2 * extension`. Side gets at least
//     `MIN_GUARANTEED_INTERACTIVE_DIM`; corners take `MIN_HIT_SIZE`
//     preferred, shrinking down to 0 when the run is tight. The side
//     strip never goes below its min (until the entire run is below it,
//     at which point the side takes everything and corners vanish).
//
// (2) Body promotion — when an axis is shorter than
//     `BODY_FLIP_THRESHOLD = MIN_GUARANTEED_INTERACTIVE_DIM + MIN_HIT_SIZE`,
//     the body's reachable interior on that axis would drop below the
//     min if the corner extended its full preferred size into the body.
//     The body therefore promotes above corner priority on that frame.
// ────────────────────────────────────────────────────────────────────────────

/** The principle constant — the minimum guaranteed length for the body
 *  interior on each axis AND for each side strip along its parallel
 *  axis. Tunable; everything else derives. */
export const MIN_GUARANTEED_INTERACTIVE_DIM = 20;

/** Below this axis dim, body promotes above corner. Derived from the
 *  principle. */
export const BODY_FLIP_THRESHOLD =
  MIN_GUARANTEED_INTERACTIVE_DIM + MIN_HIT_SIZE;

// ────────────────────────────────────────────────────────────────────────────
// Zone — one entry in the layout
// ────────────────────────────────────────────────────────────────────────────

export type SelectionControlRole =
  | { kind: "translate" }
  | { kind: "resize_corner"; direction: "nw" | "ne" | "se" | "sw" }
  | { kind: "resize_edge"; direction: "n" | "e" | "s" | "w" }
  | { kind: "rotate"; corner: RotationCorner };

export interface SelectionControlZone {
  rect: Rect;
  priority: number;
  role: SelectionControlRole;
  /** Stable semantic identifier; matches the OverlayElement.label that
   *  the chrome builder forwards downstream. */
  label: string;
}

export interface SelectionControlLayout {
  /** Zones in declaration order. Hit-test resolution is by priority; order
   *  serves as tie-break only. */
  zones: SelectionControlZone[];
  /** Whether knobs render visually. False below MIN_CHROME_VISIBLE_SIZE.
   *  The body zone exists and is hit-able regardless. */
  controls_visible: boolean;
  /** True when at least one axis is shorter than BODY_FLIP_THRESHOLD,
   *  promoting body above corner. */
  small_mode: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// 1D perimeter-axis negotiation
//
// Given the total perimeter length on one axis (e.g. the top run from
// the NW outer corner to the NE outer corner = `bbox_w + 2 * extension`),
// split it into [corner | edge | corner].
//
// Side (edge) is higher-priority than corner: it guarantees its minimum
// length first; corner takes the remainder and shrinks when constrained.
// ────────────────────────────────────────────────────────────────────────────

/**
 * @returns { corner, edge } — lengths in screen-px summing to `total`
 * (corner * 2 + edge === total). Each is `>= 0`.
 *
 * Three phases:
 *  - **comfortable** (`total >= 2 * corner_preferred + edge_min`):
 *    corners at preferred, edge takes the surplus.
 *  - **squeezed** (`total >= edge_min`): edge at its min, corners share
 *    the remainder.
 *  - **tiny** (`total < edge_min`): edge takes everything, corners 0.
 */
export function negotiateAxis(
  total: number,
  corner_preferred: number,
  edge_min: number
): { corner: number; edge: number } {
  if (total <= 0) return { corner: 0, edge: 0 };
  if (total >= corner_preferred * 2 + edge_min) {
    return { corner: corner_preferred, edge: total - corner_preferred * 2 };
  }
  if (total >= edge_min) {
    return { corner: (total - edge_min) / 2, edge: edge_min };
  }
  return { corner: 0, edge: total };
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute the selection control layout for a screen-space rect.
 *
 * Pure: no DOM, no global state. Same inputs → same zones.
 *
 * The perimeter ring straddles the bbox edge with `extension =
 * hit_size / 2` overhang outside. Along each axis the run of length
 * `axis_dim + 2 * extension` is split via {@link negotiateAxis} into
 * `[corner | edge | corner]`. The 4 corners and 4 edges in 2D then tile
 * the ring as a strict 3×3 grid of cells — **non-overlapping**. Body
 * sits at rect_screen and may overlap with the ring's inside-bbox half
 * in comfortable mode; priority resolves those overlaps.
 *
 * See the comment block in this file for the full principle.
 */
export function computeSelectionControlLayout(
  rect_screen: Rect,
  opts: { handle_size: number; show_rotation: boolean }
): SelectionControlLayout {
  const zones: SelectionControlZone[] = [];

  const w_violated = rect_screen.width < BODY_FLIP_THRESHOLD;
  const h_violated = rect_screen.height < BODY_FLIP_THRESHOLD;
  const small_mode = w_violated || h_violated;
  const controls_visible =
    rect_screen.width >= MIN_CHROME_VISIBLE_SIZE &&
    rect_screen.height >= MIN_CHROME_VISIBLE_SIZE;

  // Body / translate zone. Always present unless degenerate; drag stays
  // available even when knobs hide. Promoted in small mode so the
  // perimeter ring's inside-bbox extension can't steal the interior.
  if (rect_screen.width >= 1 || rect_screen.height >= 1) {
    zones.push({
      rect: rect_screen,
      priority: small_mode
        ? HUDHitPriority.TRANSLATE_BODY_SMALL
        : HUDHitPriority.TRANSLATE_BODY,
      role: { kind: "translate" },
      label: "translate",
    });
  }

  if (!controls_visible) {
    return { zones, controls_visible, small_mode };
  }

  const hit_size = Math.max(opts.handle_size + 4, MIN_HIT_SIZE);
  const extension = hit_size / 2;

  // ── 9-slice perimeter ring (mutually exclusive) ─────────────────────────
  // Per-axis negotiation: side guarantees min, corners take the rest.
  const total_x = rect_screen.width + extension * 2;
  const total_y = rect_screen.height + extension * 2;
  const { corner: cx, edge: ex } = negotiateAxis(
    total_x,
    hit_size,
    MIN_GUARANTEED_INTERACTIVE_DIM
  );
  const { corner: cy, edge: ey } = negotiateAxis(
    total_y,
    hit_size,
    MIN_GUARANTEED_INTERACTIVE_DIM
  );

  const left = rect_screen.x - extension;
  const top = rect_screen.y - extension;
  const mid_x = left + cx;
  const mid_y = top + cy;
  const right_x = mid_x + ex;
  const right_y = mid_y + ey;

  const cornerRects = {
    nw: { x: left, y: top, width: cx, height: cy },
    ne: { x: right_x, y: top, width: cx, height: cy },
    sw: { x: left, y: right_y, width: cx, height: cy },
    se: { x: right_x, y: right_y, width: cx, height: cy },
  } as const;
  const edgeRects = {
    n: { x: mid_x, y: top, width: ex, height: cy },
    s: { x: mid_x, y: right_y, width: ex, height: cy },
    w: { x: left, y: mid_y, width: cx, height: ey },
    e: { x: right_x, y: mid_y, width: cx, height: ey },
  } as const;

  for (const dir of CORNER_DIRS) {
    const rect = cornerRects[dir];
    if (rect.width <= 0 || rect.height <= 0) continue;
    zones.push({
      rect,
      priority: HUDHitPriority.RESIZE_HANDLE_CORNER,
      role: { kind: "resize_corner", direction: dir },
      label: CORNER_LABEL[dir],
    });
  }

  // Edge promotion is per-axis: an edge needs to outrank the (also
  // promoted) body only when its parallel axis is violated. N/S edges
  // are parallel to W; E/W edges are parallel to H.
  const edge_priority = {
    n: w_violated
      ? HUDHitPriority.RESIZE_HANDLE_EDGE_SMALL
      : HUDHitPriority.RESIZE_HANDLE_EDGE,
    s: w_violated
      ? HUDHitPriority.RESIZE_HANDLE_EDGE_SMALL
      : HUDHitPriority.RESIZE_HANDLE_EDGE,
    e: h_violated
      ? HUDHitPriority.RESIZE_HANDLE_EDGE_SMALL
      : HUDHitPriority.RESIZE_HANDLE_EDGE,
    w: h_violated
      ? HUDHitPriority.RESIZE_HANDLE_EDGE_SMALL
      : HUDHitPriority.RESIZE_HANDLE_EDGE,
  };

  for (const dir of EDGE_DIRS) {
    const rect = edgeRects[dir];
    if (rect.width <= 0 || rect.height <= 0) continue;
    zones.push({
      rect,
      priority: edge_priority[dir],
      role: { kind: "resize_edge", direction: dir },
      label: EDGE_LABEL[dir],
    });
  }

  // Rotation halo — one rect per corner that wraps the resize-corner
  // zone. Extends `ROTATION_WRAP` px diagonally outward from the resize
  // rect in the cardinal direction of the corner, so the wrap rect
  // OVERLAPS the resize rect AND body+edge zones near the corner.
  //
  // Overlap is resolved by priority: rotation has the highest numeric
  // value (== lowest priority) in `HUDHitPriority`, so it loses to
  // resize-corner, edges, and body wherever they overlap. The net
  // rotation hit footprint is the L-strip immediately outside the
  // resize corner — no gaps, no overlap on the cursor, no body
  // intrusion. This replaces the previous "16×16 diagonal handle"
  // model, which always left dead L-strips wrapping the corner at low
  // zoom regardless of offset.
  if (opts.show_rotation) {
    for (const dir of CORNER_DIRS) {
      const resize = cornerRects[dir];
      if (resize.width <= 0 || resize.height <= 0) continue;
      const [dx, dy] = cmath.compass.cardinal_direction_vector[dir];
      zones.push({
        rect: {
          x: resize.x + (dx > 0 ? 0 : -ROTATION_WRAP),
          y: resize.y + (dy > 0 ? 0 : -ROTATION_WRAP),
          width: resize.width + ROTATION_WRAP,
          height: resize.height + ROTATION_WRAP,
        },
        priority: HUDHitPriority.ROTATE_HANDLE,
        role: { kind: "rotate", corner: dir },
        label: ROTATE_LABEL[dir],
      });
    }
  }

  return { zones, controls_visible, small_mode };
}
