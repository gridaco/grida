import cmath from "@grida/cmath";
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
      /** Current shape during the gesture. Same kind as `initial_shape`. */
      current_shape: SelectionShape;
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
  dy: number
): SelectionShape {
  if (initial.kind === "rect") {
    return {
      kind: "rect",
      rect: applyResizeRect(initial.rect, direction, dx, dy),
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
    return {
      kind: "transformed",
      local: applyResizeRect(initial.local, direction, ldx, ldy),
      matrix: m,
    };
  }
  // line / unresolved — no corner-resize semantics.
  return initial;
}

function applyResizeRect(
  initial: Rect,
  direction: ResizeDirection,
  dx: number,
  dy: number
): Rect {
  let { x, y, width, height } = initial;

  switch (direction) {
    case "n":
      y += dy;
      height -= dy;
      break;
    case "s":
      height += dy;
      break;
    case "e":
      width += dx;
      break;
    case "w":
      x += dx;
      width -= dx;
      break;
    case "ne":
      y += dy;
      height -= dy;
      width += dx;
      break;
    case "nw":
      y += dy;
      height -= dy;
      x += dx;
      width -= dx;
      break;
    case "se":
      width += dx;
      height += dy;
      break;
    case "sw":
      x += dx;
      width -= dx;
      height += dy;
      break;
  }
  return { x, y, width, height };
}
