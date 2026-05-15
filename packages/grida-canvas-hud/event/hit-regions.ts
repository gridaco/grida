import cmath from "@grida/cmath";
import type { NodeId, Rect } from "./gesture";
import type { ResizeDirection, RotationCorner } from "./cursor";

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
 *   edges). Carries the group's member ids and the group's initial rect.
 * - `rotate_handle` — one of 4 virtual rotation regions outside the group's
 *   corners. Carries the group's initial rect for center math.
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
      initial_rect: { x: number; y: number; width: number; height: number };
    }
  | {
      kind: "rotate_handle";
      corner: RotationCorner;
      ids: readonly NodeId[];
      initial_rect: { x: number; y: number; width: number; height: number };
    }
  | {
      kind: "endpoint_handle";
      endpoint: "p1" | "p2";
      id: NodeId;
      /** Snapshot of the line endpoints in doc-space at chrome build time. */
      p1: [number, number];
      p2: [number, number];
    }
  | { kind: "translate_handle"; ids: readonly NodeId[] };

/**
 * A screen-space AABB associated with an `OverlayAction`.
 *
 * Each region carries an explicit `priority` — UX priority is data, not
 * iteration order. `HitRegions.hitTest` returns the lowest-priority value
 * at the hit point. See `selection-controls.ts:HUDHitPriority` for the
 * canonical priority ladder.
 */
export interface HitRegion {
  rect: Rect; // screen-space
  action: OverlayAction;
  /** Lower wins. Tie-break: later push wins. */
  priority: number;
  /** Stable semantic identifier for tests and debug overlays. */
  label: string;
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
      if (!cmath.rect.containsPoint(r.rect, point)) continue;
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
