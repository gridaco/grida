// World-space geometry queries.
//
// Pure types + a memoizing decorator. Zero DOM imports — the concrete
// driver (`SvgGeometryDriver`) lives in the DOM surface and is wired in
// via `editor._internal.set_geometry`. Mirrors the `core/camera.ts` +
// `BoundsResolver` injection pattern.
//
// Coordinate space: **world** (SVG-author coordinates / `viewBox`
// space). Never screen-space. The HUD's screen-space helpers
// (`container_box` in `dom.ts`) stay surface-internal — different
// concept, different consumer.

import type { NodeId, Rect, Unsubscribe, Vec2 } from "../types";

/**
 * Read-only access to world-space node bounds and hit-tests.
 *
 * Implementations should be cheap to call: snap (the main consumer)
 * will query dozens of nodes per pointermove. The driver wraps SVG
 * `getBBox` + `getCTM`; the memoizer caches per-`NodeId` to survive
 * the surface re-rendering the SVG tree every editor tick.
 *
 * **Freshness contract.** Every read MUST reflect the CURRENT document
 * — including when issued synchronously from inside a doc-change
 * listener (`subscribe_geometry` fires mid-mutation, before any
 * render). An implementation backed by a lazily-synced projection
 * (e.g. a rendered DOM tree) must flush that projection before
 * reading; compare `SvgDocument.revision` against the projection's
 * last-rendered revision. Returning the previous document's geometry
 * is not a transient glitch: the `MemoizedGeometryProvider` wrapper
 * caches whatever the driver returns, so one stale read poisons every
 * later consumer until the next invalidation (align/resize then plan
 * against one-mutation-old bounds and oscillate — see
 * `__tests__/geometry-stale-read.browser.test.ts`).
 */
export interface GeometryProvider {
  /**
   * World-space bounding rect for a single node, or `null` when the
   * node has no rendered geometry (orphan, detached, unsupported tag).
   */
  bounds_of(id: NodeId): Rect | null;

  /**
   * Bulk read. Missing nodes are simply absent from the result map.
   * Drivers should be free to batch / parallelize internally.
   */
  bounds_of_many(ids: ReadonlyArray<NodeId>): Map<NodeId, Rect>;

  /**
   * Ids of nodes whose world-space bounds intersect `rect`. Order is
   * implementation-defined.
   */
  nodes_in_rect(rect: Rect): NodeId[];

  /**
   * Topmost node id at world-space point `p`, or `null` when no node
   * is hit. "Topmost" is defined by the renderer's z-order.
   */
  node_at_point(p: Vec2): NodeId | null;

  /**
   * Re-express a **world-space** delta vector in the frame a node's
   * position attributes are written in — its parent user-space. For a
   * node under a scaled/rotated `<g>` ancestor, or inside a nested
   * `<svg>` viewport that scales its user space, the local frame differs
   * from world by that linear transform; a translate must be written in
   * the local frame so the on-screen motion matches the world delta
   * (otherwise it moves `scale ×` too far).
   *
   * Optional: only DOM-backed providers (with a real layout engine) can
   * derive the frame. Providers that omit it imply the flat-doc identity
   * (world ≡ local), and callers fall back to the raw delta.
   */
  world_delta_to_local?(id: NodeId, delta: Vec2): Vec2;
}

export type GeometrySignals = {
  /** Fires when tree shape changes (insert/remove/reorder). */
  subscribe_structure: (cb: () => void) => Unsubscribe;
  /** Fires when any bounds-affecting change occurs. */
  subscribe_geometry: (cb: () => void) => Unsubscribe;
};

/**
 * Caches `bounds_of` results keyed on `NodeId`; full-clears on either
 * `structure_version` or `geometry_version` bump. See ../../docs/geometry.md for
 * why the cache is load-bearing under the surface's per-tick re-render.
 */
export class MemoizedGeometryProvider implements GeometryProvider {
  private readonly driver: GeometryProvider;
  private readonly unsubscribers: Unsubscribe[] = [];
  private cache = new Map<NodeId, Rect | null>();

  constructor(driver: GeometryProvider, signals: GeometrySignals) {
    this.driver = driver;
    const invalidate = () => this.cache.clear();
    this.unsubscribers.push(signals.subscribe_structure(invalidate));
    this.unsubscribers.push(signals.subscribe_geometry(invalidate));
  }

  bounds_of(id: NodeId): Rect | null {
    if (this.cache.has(id)) return this.cache.get(id) ?? null;
    const r = this.driver.bounds_of(id);
    this.cache.set(id, r);
    return r;
  }

  bounds_of_many(ids: ReadonlyArray<NodeId>): Map<NodeId, Rect> {
    const out = new Map<NodeId, Rect>();
    const missing: NodeId[] = [];
    for (const id of ids) {
      if (this.cache.has(id)) {
        const r = this.cache.get(id);
        if (r) out.set(id, r);
      } else {
        missing.push(id);
      }
    }
    if (missing.length > 0) {
      const fresh = this.driver.bounds_of_many(missing);
      for (const id of missing) {
        const r = fresh.get(id) ?? null;
        this.cache.set(id, r);
        if (r) out.set(id, r);
      }
    }
    return out;
  }

  /**
   * Pass-through. These are less hot than `bounds_of` (called once per
   * gesture frame at most) and their result is sensitive to current
   * viewport state, so caching them would be a footgun.
   */
  nodes_in_rect(rect: Rect): NodeId[] {
    return this.driver.nodes_in_rect(rect);
  }

  node_at_point(p: Vec2): NodeId | null {
    return this.driver.node_at_point(p);
  }

  /** Pass-through. Frame projection depends on live layout, not on the
   *  bounds cache, so there is nothing to memoize. Falls back to the raw
   *  delta when the driver can't resolve a frame. */
  world_delta_to_local(id: NodeId, delta: Vec2): Vec2 {
    return this.driver.world_delta_to_local?.(id, delta) ?? delta;
  }

  /** Unsubscribe from both signals. Call on surface detach. */
  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
    this.cache.clear();
  }
}
