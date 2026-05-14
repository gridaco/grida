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
 * Regions are added by the chrome builder each frame and consulted by the
 * surface during pointer-down to decide if the event hit chrome (e.g. a
 * handle) before falling through to the scene `pick`.
 */
export interface HitRegion {
  rect: Rect; // screen-space
  action: OverlayAction;
}

/**
 * Registry of overlay UI hit regions.
 *
 * Regions are appended in draw order (back-to-front). `hitTest` iterates
 * in reverse so the topmost region wins — matching how the chrome is
 * visually layered.
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
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (cmath.rect.containsPoint(r.rect, point)) return r.action;
    }
    return null;
  }

  isEmpty(): boolean {
    return this.regions.length === 0;
  }

  /** Read-only access for tests. */
  toArray(): readonly HitRegion[] {
    return this.regions;
  }
}
