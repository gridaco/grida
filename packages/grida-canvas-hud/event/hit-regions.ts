import cmath from "@grida/cmath";
import type { NodeId, Rect } from "./gesture";
import type { ResizeDirection, RotationCorner } from "./cursor";
import type { SelectionShape } from "./shape";

/**
 * Action a UI hit-region triggers when clicked.
 *
 * Each variant carries a snapshot of the relevant shape state at the time
 * the chrome was built — so the surface can start a gesture without an
 * extra round-trip to host providers. The chrome builder is the single
 * source of truth for "what does this hit region act on?"
 *
 * - `select_node` — user clicked on a node-representative UI region.
 * - `resize_handle` — one of 8 resize regions (4 corner knobs + 4 virtual
 *   edges). Carries the group's member ids and the group's initial
 *   `SelectionShape` — `rect` for axis-aligned groups, `transformed` for
 *   rotated/sheared groups (so resize math runs in the local frame).
 * - `rotate_handle` — one of 4 virtual rotation regions outside the group's
 *   corners. Carries the group's initial `SelectionShape` for center math
 *   (pivot = center of `shapeBounds(initial_shape)`).
 * - `endpoint_handle` — endpoint of a line-shape selection. Carries the
 *   line's current p1/p2 so dragging is relative to a stable snapshot.
 * - `translate_handle` — body region covering a selection group's bbox.
 *   Pushed under the corner / edge / rotation regions so resize wins on
 *   overlap. Lets the user grab any part of the selection chrome — including
 *   transparent corners of a circle's bbox — to start a translate. Hud is
 *   the event source once present.
 */
export type OverlayAction =
  | { kind: "select_node"; id: NodeId }
  | {
      kind: "resize_handle";
      direction: ResizeDirection;
      ids: readonly NodeId[];
      initial_shape: SelectionShape;
    }
  | {
      kind: "rotate_handle";
      corner: RotationCorner;
      ids: readonly NodeId[];
      initial_shape: SelectionShape;
    }
  | {
      kind: "endpoint_handle";
      endpoint: "p1" | "p2";
      id: NodeId;
      /** Snapshot of the line endpoints in doc-space at chrome build time. */
      p1: [number, number];
      p2: [number, number];
    }
  | { kind: "translate_handle"; ids: readonly NodeId[] }
  | {
      /**
       * A vertex knob on a path being content-edited. Drag → translate the
       * vertex (and any other vertices co-selected at down-time) in the
       * path's local frame; click → replace-select the vertex.
       */
      kind: "vertex_handle";
      /** Path node id under content-edit. */
      node_id: NodeId;
      /** Index of the vertex within the path's vector network. */
      index: number;
      /** Doc-space position of the vertex at chrome build time. */
      pos: [number, number];
    }
  | {
      /**
       * A tangent control-point knob on a path under content-edit. Drag →
       * translate the tangent (the host applies mirror policy); click →
       * replace-select the tangent.
       */
      kind: "tangent_handle";
      node_id: NodeId;
      /** `[vertex_idx, 0]` for ta on segment with a===v; `[v, 1]` for tb where b===v. */
      tangent: readonly [number, 0 | 1];
      /** Doc-space position of the tangent control point at chrome build time. */
      pos: [number, number];
    }
  | {
      /**
       * A path segment under content-edit, claimed by the chrome's single
       * per-segment region. Click → split the segment at the **projected**
       * t (cursor → nearest point on curve). Drag → start a bend gesture
       * with `ca` frozen to that same projected t.
       *
       * Mirrors the main editor's `snapped_segment_p` model: at any cursor
       * position there is EXACTLY ONE candidate insertion point per
       * segment — the point on the cubic closest to the cursor. The action
       * carries the segment's four doc-space control points; the consumer
       * (`event/state.ts`) computes `t` on demand via `cmath.bezier.project`
       * at the cursor's current doc-space position. No pre-sampled grid.
       */
      kind: "segment_strip";
      node_id: NodeId;
      segment: number;
      /** Vertex index of endpoint `a` (used by the segment-drag → translate
       *  path so the host can route the gesture to a vertex translation
       *  without consulting its own segment table). */
      a_idx: number;
      /** Vertex index of endpoint `b`. */
      b_idx: number;
      /** Doc-space cubic control points. The consumer projects the cursor
       *  against these on demand to get the live `t`. */
      a: readonly [number, number];
      b: readonly [number, number];
      a_control: readonly [number, number];
      b_control: readonly [number, number];
    }
  | {
      /**
       * Ghost insertion knob — the visible half-point preview on a hovered
       * segment. Sits in the priority ladder ABOVE `segment_strip` (so it
       * wins clicks at the marker) and BELOW `vertex_handle` (so a real
       * vertex collapsed onto the ghost still wins). Carries the segment's
       * cubic control points so the consumer can recompute `t` live —
       * mirrors `segment_strip`, but with explicitly "this is the half-
       * point control" semantics. Pointer-down dispatches to `split_segment`;
       * drag promotes to `bend_segment` with `ca` = the live `t`.
       */
      kind: "ghost_handle";
      node_id: NodeId;
      segment: number;
      /** Vertex indices of the segment's endpoints, mirrors `segment_strip`. */
      a_idx: number;
      b_idx: number;
      a: readonly [number, number];
      b: readonly [number, number];
      a_control: readonly [number, number];
      b_control: readonly [number, number];
    }
  | {
      /**
       * Corner-radius handle — the built-in chrome promoted from labs to
       * `surface.setCornerRadius(input)`. One action variant covers all
       * three intent flavors the gesture emits (`corner_radius`,
       * `corner_radius_explicit`, `corner_radius_uniform`); the surface
       * branches on `geometry` + modifiers to pick the intent kind at
       * preview/commit time.
       *
       * - `geometry: "rect"`, `anchor: "nw"|"ne"|"se"|"sw"` — one of four
       *   per-corner knobs. Carries the corner being acted on directly;
       *   alt-held drag emits `corner_radius_explicit`, otherwise
       *   `corner_radius`.
       * - `geometry: "rect"`, `anchor: null` — the singleton center
       *   handle on an all-equal-radii rect. The surface resolves the
       *   pulled-toward corner after the drag-threshold and emits
       *   `corner_radius` / `corner_radius_explicit` from there. Alt
       *   semantics still apply (after the resolution).
       * - `geometry: "line"`, `anchor: null` — single uniform handle on
       *   the line's `a → b` axis. Emits `corner_radius_uniform`. Alt
       *   has no effect (no anchor to pin).
       *
       * The action stores the original `pos` (doc-space anchor of the
       * handle at chrome build time). The gesture computes the new
       * radius from the cursor's projection onto the corresponding
       * geometry axis each frame.
       */
      kind: "corner_radius_handle";
      node_id: NodeId;
      geometry: "rect" | "line";
      /** Doc-space position of the handle at chrome build time. */
      pos: readonly [number, number];
      /**
       * RECT geometry only — the rect in LOCAL space (axis-aligned).
       * The gesture re-derives per-anchor corner positions from
       * this on every projection. When the input carries a
       * `transform`, this rect is the local AABB and `transform`
       * maps it to doc space; otherwise the rect IS in doc space.
       */
      rect?: { x: number; y: number; width: number; height: number };
      /**
       * RECT geometry only — optional local → doc affine transform.
       * Present when the host's selection is a rotated / sheared
       * rect; absent when axis-aligned. The state machine applies
       * this when projecting the cursor onto each anchor's
       * diagonal so a knob on a rotated rect tracks the rotated
       * axis, not the doc-space one.
       */
      transform?: cmath.Transform;
      /**
       * RECT geometry only — the corner anchors this hit region
       * stands in for. Length 1 for a single-corner knob (sub-max
       * radii); length 2 for an oblong-max pair (TL/BL or TR/BR);
       * length 4 for square-max (all four collapsed to one). When
       * the length is > 1, the state machine resolves the user's
       * intended anchor from drag direction after a small
       * threshold, picking AMONG these candidates only.
       */
      candidates?: readonly ("nw" | "ne" | "se" | "sw")[];
      /**
       * LINE geometry only — the line endpoints. `a` is the radius-
       * zero end; `b` is saturation. The gesture projects the cursor
       * onto a → b.
       */
      a?: readonly [number, number];
      b?: readonly [number, number];
    }
  | {
      /**
       * Parametric handle knob — the user-facing element of a
       * `surface.setParametricHandles(...)` input. ONE region per
       * coincidence group (per `parametricHandleLayoutGroups`); when
       * the group has 2+ members the state machine resolves which
       * handle the pointer meant from drag direction.
       *
       * Carries everything the gesture needs to project the cursor
       * each frame without consulting the input table again:
       *
       * - `pos` — doc-space anchor of the knob at chrome build time.
       *   Used as the screen-space hit anchor too (the gesture
       *   computes a fresh `value` from `point_doc → track`).
       * - `candidates` — the layout entries this region stands in
       *   for. Single-handle regions have one entry; coincident
       *   regions have N. Each entry carries its handle id, doc-space
       *   track (curve OR point set), and effective domain so the
       *   gesture doesn't need to re-derive them.
       */
      kind: "parametric_knob";
      node_id: NodeId;
      pos: readonly [number, number];
      candidates: readonly {
        handle_id: string;
        track_doc: cmath.ui.Curve | cmath.ui.PointSet;
        domain: { min: number; max: number; step?: number };
      }[];
    };

/**
 * A screen-space AABB associated with an `OverlayAction`.
 *
 * Each region carries an explicit `priority` — UX priority is data, not
 * iteration order. `HitRegions.hitTest` returns the lowest-priority value
 * at the hit point. See `selection-controls.ts:HUDHitPriority` for the
 * canonical priority ladder.
 */
export interface HitRegion {
  rect: Rect; // screen-space when `inverse_transform` is omitted; shadow-space otherwise
  /** If present, the pointer is transformed by this affine before AABB
   *  containment against `rect`. Carried for transformed-chrome zones so
   *  hit-test stays exact at any rotation without inflating to an
   *  AABB-of-rotated-corners. */
  inverse_transform?: cmath.Transform;
  action: OverlayAction;
  /** Lower wins. Tie-break: later push wins. */
  priority: number;
  /** Stable semantic identifier for tests and debug overlays. */
  label: string;
  /**
   * Optional refinement applied AFTER the AABB containment check. Returns
   * `false` to reject the hit even though the rect contained the point.
   * Used by segment hit regions to enforce "near the curve in screen-px,"
   * not just "anywhere in the bezier's bounding box."
   *
   * Receives the same point passed to `hitTestRegion` (in the same frame
   * as `rect` — screen-space normally, shadow-space when
   * `inverse_transform` is set).
   */
  customHitTest?: (point: cmath.Vector2) => boolean;
}

/**
 * Registry of overlay UI hit regions.
 *
 * Regions are appended in declaration order. `hitTest` resolves by
 * **lowest priority value** at the hit point; declaration order
 * serves as tie-break only (later push wins on equal priorities,
 * preserving the prior "topmost wins on overlap" feel).
 */
export class HitRegions {
  private regions: HitRegion[] = [];

  clear(): void {
    this.regions.length = 0;
  }

  push(region: HitRegion): void {
    this.regions.push(region);
  }

  hitTest(point: cmath.Vector2): OverlayAction | null {
    return this.hitTestRegion(point)?.action ?? null;
  }

  /** Returns the full region (label + priority) — used by tests and
   *  debug tooling that want to assert on `label`. `hitTest` delegates here. */
  hitTestRegion(point: cmath.Vector2): HitRegion | null {
    let best: HitRegion | null = null;
    for (const r of this.regions) {
      const test_point = r.inverse_transform
        ? cmath.vector2.transform(point, r.inverse_transform)
        : point;
      if (!cmath.rect.containsPoint(r.rect, test_point)) continue;
      // AABB passed — apply the optional refinement. Curve-shaped hit
      // regions use this to reject points that are inside the bezier
      // bbox but far from the curve itself.
      if (r.customHitTest && !r.customHitTest(test_point)) continue;
      // `<=` so a later push at the same priority wins (preserves the
      // prior "topmost on overlap" feel; tie-break is still push order).
      if (best === null || r.priority <= best.priority) best = r;
    }
    return best;
  }

  isEmpty(): boolean {
    return this.regions.length === 0;
  }

  /** Read-only access for tests. */
  toArray(): readonly HitRegion[] {
    return this.regions;
  }
}
