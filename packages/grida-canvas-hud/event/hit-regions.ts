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
