import cmath from "@grida/cmath";
import type { AffineTransform } from "../primitives/transform-box";
import type { ResizeDirection, RotationCorner } from "./cursor";
// Type-only import — `SelectionShape` is defined in `./shape`, which itself
// imports `NodeId` and `Rect` from this file. TS resolves cyclic type imports
// without a runtime cycle, so this stays cheap.
import type { SelectionShape } from "./shape";

/**
 * Rect type local to the event/ layer.
 *
 * Mirrors `cmath.Rectangle` shape; declared here to keep `event/` free of
 * imports beyond `cmath` types.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type NodeId = string;

/**
 * Active interaction state for the surface.
 *
 * Coordinates inside each variant are documented per-field. The surface
 * stores anchor points in document-space (so they survive camera pans during
 * a gesture); incremental deltas are computed against the anchor each move.
 */
export type SurfaceGesture =
  | { kind: "idle" }
  | {
      kind: "pan";
      /** Last screen-space pointer position. */
      prev_screen: cmath.Vector2;
    }
  | {
      kind: "marquee";
      /** Anchor (pointer-down) in document-space. */
      anchor_doc: cmath.Vector2;
      /** Current pointer in document-space. */
      current_doc: cmath.Vector2;
    }
  | {
      /**
       * Freeform polygon selection. Sibling to `marquee` — empty-space drag
       * promotes here when the host has set the surface's
       * `vectorSelectionMode` to `"lasso"`. The HUD doesn't decide which
       * gesture to use; the host pushes the mode in alongside its tool
       * toggle. See `Surface.setVectorSelectionMode`.
       */
      kind: "lasso";
      /** First sample (pointer-down position in document-space). */
      anchor_doc: cmath.Vector2;
      /**
       * Polyline samples in document-space, oldest-first.
       * `points[0] === anchor_doc`. Per pointer_move samples are appended
       * only when the rounded screen-pixel differs from the last sample,
       * keeping growth bounded on slow drags. The host's hit-test closes
       * the polygon implicitly (last → first) — matches
       * `cmath.polygon.pointInPolygon`'s ray-cast.
       */
      points: cmath.Vector2[];
    }
  | {
      kind: "translate";
      /** Selected ids at the start of the gesture. */
      ids: NodeId[];
      /** Anchor (pointer-down) in document-space. */
      anchor_doc: cmath.Vector2;
      /** Last reported pointer in document-space. */
      last_doc: cmath.Vector2;
    }
  | {
      kind: "resize";
      /** Member ids of the group being resized (1 or more). */
      ids: NodeId[];
      /** Which handle the user grabbed. */
      direction: ResizeDirection;
      /**
       * Selection shape at gesture start. For `kind: "rect"` this is the
       * doc-space bbox; for `kind: "transformed"` it carries the local-frame
       * AABB + matrix so resize math runs in the rotated/skewed local frame.
       */
      initial_shape: SelectionShape;
      /** Anchor (pointer-down) in document-space. */
      anchor_doc: cmath.Vector2;
      /** Most-recent pointer position in document-space (= `anchor_doc`
       *  until the first move). Lets a mid-drag modifier toggle recompute
       *  `preview_shape` from the live delta without a pointer move. */
      last_doc: cmath.Vector2;
      /** Current shape during the gesture. Same kind as `initial_shape`.
       *  Opposite-anchored — feeds the emitted `resize` intent (move +
       *  commit). The host derives its own anchor (e.g. Alt → center)
       *  from these dims, so this MUST stay opposite-anchored. */
      current_shape: SelectionShape;
      /** Shape to DRAW for the dashed preview. Equals `current_shape`
       *  except under Alt, where it is symmetric about the initial
       *  center so the dashed box matches where a center-anchoring host
       *  lands the artwork (otherwise the preview visibly lags the
       *  actual result). Visual only — never emitted on an intent. */
      preview_shape: SelectionShape;
    }
  | {
      kind: "rotate";
      ids: NodeId[];
      corner: RotationCorner;
      /** Subject center in document-space. */
      center_doc: cmath.Vector2;
      /** Angle at gesture start (radians). */
      anchor_angle: number;
      /** Current angle (radians). */
      current_angle: number;
      /**
       * Selection's screen-space rotation at gesture start (radians).
       * Composed with `current_angle - anchor_angle` each frame to set
       * the rotate-cursor's `baseAngle` — so cursors on already-rotated
       * selections continue tilting correctly mid-gesture instead of
       * snapping back to 0 + delta.
       */
      initial_cursor_angle: number;
    }
  | {
      kind: "endpoint";
      id: NodeId;
      endpoint: "p1" | "p2";
      /** Current endpoint position in document-space. */
      pos_doc: cmath.Vector2;
    }
  | {
      /**
       * Dragging one or more vertices of a path under content-edit. The
       * `indices` are captured at gesture start; intra-gesture selection
       * mirror changes do not affect what the gesture moves.
       */
      kind: "translate_vertex";
      /** Path node id under content-edit. */
      node_id: NodeId;
      /** Vertex indices being moved. */
      indices: number[];
      /** Anchor (pointer-down) in document-space. */
      anchor_doc: cmath.Vector2;
      /** Last reported pointer in document-space. */
      last_doc: cmath.Vector2;
    }
  | {
      /**
       * Dragging the path-edit sub-selection. Triggered by segment-body
       * drag (the default — Meta switches to `bend_segment` instead) and
       * any future drag origin that targets the whole sub-selection
       * (multi-vertex drag is the planned follow-up).
       *
       * The HUD doesn't know which vertices are in the sub-selection
       * (host owns it). It DOES know "this gesture additionally targets
       * these vertex indices" — e.g. the endpoints of the segment that
       * initiated the drag, when that segment isn't yet in the
       * sub-selection. The host UNIONs `additional_vertex_indices` with
       * its authoritative sub-selection on each preview frame.
       */
      kind: "translate_vector_selection";
      node_id: NodeId;
      additional_vertex_indices: readonly number[];
      anchor_doc: cmath.Vector2;
      last_doc: cmath.Vector2;
    }
  | {
      /**
       * Dragging a tangent control point. The host applies the mirror
       * policy (`auto` by default — infer smooth-vs-broken). The chrome
       * builder owned the anchor; this gesture only tracks the moving
       * end of the handle line.
       */
      kind: "translate_tangent";
      node_id: NodeId;
      tangent: readonly [number, 0 | 1];
      /** Tangent control point's doc-space position at gesture start
       *  (carried from chrome via `decision.pos`). */
      anchor_doc: cmath.Vector2;
      last_doc: cmath.Vector2;
      /** Pointer's doc-space position at gesture start. Distinct from
       *  `anchor_doc` because the cursor lands within the knob's Fitts'-
       *  tolerant hit area, not pixel-perfect on the control point.
       *  Used to detect "click-no-drag": commit is skipped when
       *  `last_doc === down_doc`, otherwise the absolute set_tangent
       *  would snap the control point to the cursor's down position. */
      down_doc: cmath.Vector2;
    }
  | {
      /**
       * Bending a segment. Press-down sampled a point on the curve at
       * parameter `ca`; drag moves that point toward `last_doc`. The
       * host re-solves tangents on every frame. Endpoints (a, b) stay
       * fixed for the duration of the gesture.
       */
      kind: "bend_segment";
      node_id: NodeId;
      segment: number;
      /** Frozen parametric position of the sampled point. */
      ca: number;
      anchor_doc: cmath.Vector2;
      last_doc: cmath.Vector2;
    }
  | {
      /**
       * Dragging a corner-radius handle.
       *
       * For RECT geometry the gesture carries the rect AABB and the
       * candidate-anchor set captured at pointer_down. When the user
       * grabs a single-corner knob (sub-max radii), `candidates` has
       * length 1 and `anchor` is set. When the user grabs a
       * coincidence group (oblong-max pair, square-max quadruple),
       * `candidates` has length 2+ and `anchor` is `null` until the
       * drag crosses the threshold; the state machine resolves the
       * anchor from drag direction AMONG `candidates` only.
       *
       * For LINE geometry the gesture carries `a` and `b`; the
       * projection axis is `a → b`. `anchor` is always `null` and
       * `candidates` is empty.
       *
       * The new radius is derived each frame by projecting the
       * cursor onto the relevant axis (rect: corner →
       * `corner + (sign_x, sign_y)`; line: `a → b`). `explicit`
       * latches the alt modifier at gesture start — the intent kind
       * is decided once.
       */
      kind: "corner_radius";
      node_id: NodeId;
      geometry: "rect" | "line";
      /** RECT only — the rect AABB in LOCAL space. Used to derive
       *  per-anchor corner positions for projection. Undefined for
       *  line. */
      rect?: { x: number; y: number; width: number; height: number };
      /** RECT only — optional local → doc transform. Threaded
       *  through from the input so the gesture projects the cursor
       *  along the ROTATED axis on a rotated rect. */
      transform?: cmath.Transform;
      /** RECT only — the candidate anchors this gesture was opened
       *  for. Length 1 means anchor is locked at start; length 2 or
       *  4 means anchor is `null` until threshold + direction
       *  resolution picks one. Empty for line. */
      candidates: readonly ("nw" | "ne" | "se" | "sw")[];
      /** Resolved corner anchor for rect (one of `candidates`).
       *  `null` while pre-resolution on a multi-candidate group, OR
       *  always for line geometry. */
      anchor: "nw" | "ne" | "se" | "sw" | null;
      /** LINE only — the line endpoints. Undefined for rect. */
      a?: cmath.Vector2;
      b?: cmath.Vector2;
      /** Screen-space pointer-down anchor — used by the multi-
       *  candidate threshold + direction resolution. */
      anchor_screen: cmath.Vector2;
      /** Doc-space pointer-down anchor — paired with `transform` to
       *  resolve the right corner on a rotated rect. The threshold
       *  check stays in screen-space (pixels), but the
       *  direction-resolution dot-product compares the doc-space drag
       *  delta (`point_doc - anchor_doc`) against the rect's
       *  rotated-into-doc sign vectors (`T.linear · sign_local`). */
      anchor_doc: cmath.Vector2;
      /** Whether alt was held at pointer_down. Latches at gesture
       *  start; intent kind is decided once. */
      explicit: boolean;
      /** Most-recent doc-space pointer. */
      last_doc: cmath.Vector2;
      /** Most-recent computed radius value (doc-space units). */
      value: number;
      /** Flips to `true` the first time `pointer_move` advances the
       *  gesture state (resolves the anchor or updates `value`).
       *  Pointer-up consults this to skip the commit on click-only
       *  interactions — `value` is seeded from the inset-padded knob
       *  position at pointer-down, so a pure click would otherwise
       *  commit a non-zero radius the user never intended. */
      dragged: boolean;
    }
  | {
      /**
       * Drag of a `parametric_handle` knob — opened from a
       * `parametric_knob` overlay action and emits `parametric_handle`
       * intents on every move + commit.
       *
       * When the action carries multiple `candidates` (a coincident
       * group), `handle_id` is `null` until the drag crosses the
       * threshold and direction-resolution picks one. `candidates`
       * is the ordered list of (handle_id, curve, domain) tuples
       * that hit-region stood in for.
       *
       * `modifiers` is the latched alt/shift state at pointer_down —
       * intent payload reports it unchanged; host interprets.
       */
      kind: "parametric_handle";
      node_id: NodeId;
      candidates: readonly {
        handle_id: string;
        track_doc: cmath.ui.Curve | cmath.ui.PointSet;
        domain: { min: number; max: number; step?: number };
      }[];
      handle_id: string | null;
      anchor_screen: cmath.Vector2;
      modifiers: { alt: boolean; shift: boolean };
      last_doc: cmath.Vector2;
      /** Last computed value in host units (post-step-quantization). */
      value: number;
      /** Flips to `true` the first time `pointer_move` advances the
       *  gesture state (resolves the handle or updates `value`).
       *  Pointer-up skips commit on click-only interactions because
       *  `value` is seeded from the inset-padded knob position at
       *  pointer-down. */
      dragged: boolean;
    }
  | {
      /**
       * Drag of a `padding_handle` knob (padding named class). Opened
       * eagerly from a `padding_handle` overlay action; emits
       * `padding_handle` intents on every move + commit.
       *
       * `mirror` is NOT latched at gesture start — read live on each
       * frame from `state.modifiers.alt`. Per the doctrine: "modifier
       * change mid-gesture updates `mirror` on subsequent previews."
       *
       * The container `rect` and starting value are captured at
       * pointer_down so subsequent value projection (`projectPaddingValue`)
       * stays exact through camera moves — value math runs in doc-space
       * against the rect snapshot, not the live geometry.
       */
      kind: "padding_handle";
      node_id: NodeId;
      side: cmath.RectangleSide;
      /** Container rect snapshot at gesture start (doc-space). */
      rect: Rect;
      /** Initial padding value at gesture start (doc-space units). */
      initial_value: number;
      /** Most-recent doc-space pointer. */
      last_doc: cmath.Vector2;
      /** Most-recent computed value (doc-space units, clamped to [0, max]). */
      value: number;
      /** Flips to `true` the first time `pointer_move` advances the
       *  gesture state. Pointer-up skips commit on click-only
       *  interactions — `value === initial_value` on first frame. */
      dragged: boolean;
    }
  | {
      /**
       * Drag of a transform-box handle (transform-box named class).
       * Opened eagerly from a `transform_box_{body,side,corner}` overlay
       * action; emits `transform_box` intents on every move + commit.
       *
       * `base_transform` is the transform at gesture start (frozen);
       * each preview reduces from `base_transform` against the
       * cumulative doc-space delta. `size` and `rotation` are the
       * container parameters at gesture start (frozen — container
       * doesn't change shape mid-gesture).
       */
      kind: "transform_box";
      id: string;
      op:
        | { type: "translate" }
        | { type: "scale_side"; side: cmath.RectangleSide }
        | { type: "rotate"; corner: cmath.IntercardinalDirection };
      /** Box size in doc-space units (frozen at gesture start). */
      size: cmath.Vector2;
      /** Container rotation (degrees) at gesture start. Used to de-rotate
       *  doc-space cursor delta into box-local frame before reducing. */
      rotation: number;
      /** Transform at gesture start (frozen). */
      base_transform: AffineTransform;
      /** Pointer-down doc-space position. */
      start_doc: cmath.Vector2;
      /** Most-recent doc-space pointer. */
      last_doc: cmath.Vector2;
      /** Most-recent reduced transform (used for the commit emit). */
      transform: AffineTransform;
      /** Flips to `true` once `pointer_move` advances. Click-no-drag → no commit. */
      dragged: boolean;
    };

export const IDLE: SurfaceGesture = { kind: "idle" };

/**
 * Compute a normalized rectangle from two corner points in document-space.
 * Thin alias over `cmath.rect.fromPoints` for ergonomic two-point use.
 */
export function rectFromPoints(a: cmath.Vector2, b: cmath.Vector2): Rect {
  // Delegated to cmath so normalization rules stay consistent across the repo.
  return cmath.rect.fromPoints([a, b]);
}

/**
 * Apply a resize-handle drag to a `SelectionShape` and return the new shape.
 *
 * `dx, dy` is the total drag delta in **document-space**, measured from
 * `anchor_doc` (the pointer-down point) to the current pointer.
 *
 * - For `kind: "rect"` shapes, the delta applies directly to the doc-space
 *   bbox. Same math as the legacy `Rect`-only `applyResize`; no behavior
 *   change for axis-aligned hosts.
 * - For `kind: "transformed"` shapes, the doc-space delta is rotated into
 *   the shape's **local** frame via the matrix's linear part (the rotation
 *   component, translation dropped), then applied to `local`. The matrix
 *   itself is preserved — only `local.x/y/width/height` change. Net effect:
 *   dragging a corner of a rotated rect extends the artwork along its
 *   rotation axis, not along world axes.
 * - For `kind: "line"` and `kind: "unresolved"` the shape is returned
 *   unchanged (lines have endpoint-knob gestures, not corner-resize).
 *
 * No constraints: width/height can go negative — host is responsible for
 * normalizing if it cares (most callers clamp to a min-size).
 */
export function applyResize(
  initial: SelectionShape,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  opts?: { fromCenter?: boolean }
): SelectionShape {
  const fromCenter = opts?.fromCenter ?? false;
  if (initial.kind === "rect") {
    return {
      kind: "rect",
      rect: applyResizeRect(initial.rect, direction, dx, dy, fromCenter),
    };
  }
  if (initial.kind === "transformed") {
    // Rotate the doc-space delta into the local frame. The matrix's
    // linear part (3x3 minus translation) is what we invert; translation
    // doesn't affect a delta.
    const m = initial.matrix;
    const linear: cmath.Transform = [
      [m[0][0], m[0][1], 0],
      [m[1][0], m[1][1], 0],
    ];
    const inv_linear = cmath.transform.invert(linear);
    const [ldx, ldy] = cmath.vector2.transform([dx, dy], inv_linear);
    // `fromCenter` symmetry runs in the local frame, so the projected
    // preview stays symmetric about the (projected) local center even
    // for rotated / sheared selections.
    return {
      kind: "transformed",
      local: applyResizeRect(initial.local, direction, ldx, ldy, fromCenter),
      matrix: m,
    };
  }
  // line / unresolved — no corner-resize semantics.
  return initial;
}

/**
 * Resize a rect by dragging `direction`'s edge/corner by `(dx, dy)`.
 *
 * Default anchors the OPPOSITE edge/corner (far side pinned). With
 * `fromCenter` (Alt), the resize is symmetric about the rect's center:
 * the dragged edge moves by the delta and the opposite edge mirrors it,
 * so the size delta doubles and the center stays put.
 */
function applyResizeRect(
  initial: Rect,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  fromCenter = false
): Rect {
  let { x, y, width, height } = initial;

  // `fromCenter` doubles the size delta (both edges travel) and shifts the
  // origin so the center is preserved. `k === 1` reproduces the legacy
  // opposite-anchored math exactly.
  const k = fromCenter ? 2 : 1;
  const hasN = direction === "n" || direction === "ne" || direction === "nw";
  const hasS = direction === "s" || direction === "se" || direction === "sw";
  const hasE = direction === "e" || direction === "ne" || direction === "se";
  const hasW = direction === "w" || direction === "nw" || direction === "sw";

  if (hasE) {
    width += k * dx;
    if (fromCenter) x -= dx;
  }
  if (hasW) {
    x += dx;
    width -= k * dx;
  }
  if (hasS) {
    height += k * dy;
    if (fromCenter) y -= dy;
  }
  if (hasN) {
    y += dy;
    height -= k * dy;
  }

  return { x, y, width, height };
}
