// Surface-scoped camera (viewport transform). Maps world (SVG user coords at
// the root) to screen (container in CSS px). Never enters `editor.state`,
// history, or `serialize()` — view ≠ document. Each `attach_dom_surface` owns
// its own camera. DOM-free; the surface wires it in by providing a
// `BoundsResolver` for `fit("<root>" | "<selection>" | NodeId)` and pushing
// viewport size on resize.

import cmath from "@grida/cmath";
import type { NodeId, Rect, Unsubscribe, Vec2 } from "../types";

/**
 * Returns world-space bounds for the given target, or `null` when
 * unresolvable (e.g. empty selection, unknown node id). Implemented by the
 * surface — the camera itself has no view into the document.
 *
 * Only string targets are passed to the resolver — `Rect` targets are
 * handled by the camera as identity (the rect IS its own bounds).
 */
export type BoundsResolver = (
  target: "<root>" | "<selection>" | NodeId
) => Rect | null;

export type CameraOptions = {
  resolve_bounds: BoundsResolver;
  initial?: cmath.Transform;
};

/**
 * Camera viewport constraint. Discriminated union with `type` so future
 * variants (`'contain'`, `'pan-region'`) can be added without breaking
 * existing call sites — each future variant has its own payload shape.
 *
 * v1.1 ships only `'cover'`. CSS analogy: `object-fit: cover` — the
 * bounds rect covers the viewport edge-to-edge. Zoom is lower-bounded
 * at fit-with-padding; pan is clamped so the bounds always covers the
 * viewport. Use for slide / page / kiosk UX where the user should
 * never see past the artwork.
 */
export type CameraConstraints = {
  /** Bounds cover viewport (viewport ⊆ bounds). Keynote / slide UX. */
  type: "cover";
  /** World-space rect, or `"<root>"` to resolve via BoundsResolver. */
  bounds: Rect | "<root>";
  /** Screen-pixel breathing room between bounds and viewport edge. */
  padding?: number;
  /**
   * Screen-pixel scroll slack past the bounds edge when zoomed in past fit.
   * Applies only on axes where the bounds strictly exceed the viewport
   * (`sw > vp_w` / `sh > vp_h`); the centered branch is unchanged, so a
   * fitted axis stays locked at center. Hard clamp — no elasticity, no
   * bounce-back. Default 0 (strict cover behavior). Negative values are
   * clamped to 0. Values approaching or exceeding the bounds extent are
   * permitted but produce visually degenerate behavior; the constraint
   * makes no attempt to cap.
   */
  pan_overshoot?: number;
};

/**
 * Surface-scoped pan/zoom state.
 *
 * The public shape leads with the peer convention (`center` / `zoom` /
 * `bounds`) and keeps the matrix as an advanced read. Methods mirror
 * Figma/Penpot where they overlap.
 */
export class Camera {
  private _transform: cmath.Transform;
  private viewport_w = 0;
  private viewport_h = 0;
  private listeners = new Set<() => void>();
  private resolve_bounds: BoundsResolver;
  private _constraints: CameraConstraints | null = null;

  constructor(opts: CameraOptions) {
    this._transform = opts.initial ?? cmath.transform.identity;
    this.resolve_bounds = opts.resolve_bounds;
  }

  // ─── constraints ────────────────────────────────────────────────────────

  /**
   * Current viewport constraint, or `null` for free pan/zoom. Set with
   * `camera.constraints = { type: 'cover', bounds: '<root>', padding: 80 }`
   * to clamp zoom + pan; assign `null` to clear.
   *
   * Constraints are applied synchronously inside `set_transform` (and
   * `_set_viewport_size`), so every public mutation respects them
   * automatically — the host never needs to subscribe-and-clamp itself.
   */
  get constraints(): CameraConstraints | null {
    return this._constraints;
  }
  set constraints(c: CameraConstraints | null) {
    this._constraints = c;
    if (c) this.reenforce();
  }

  // ─── reads ────────────────────────────────────────────────────────────────

  /** Underlying 2D affine. World→screen. */
  get transform(): cmath.Transform {
    return this._transform;
  }

  /** Uniform scale factor. 1 = 100 %. */
  get zoom(): number {
    return this._transform[0][0];
  }

  /** World-space point currently at viewport center. */
  get center(): Vec2 {
    return this.screen_to_world({
      x: this.viewport_w / 2,
      y: this.viewport_h / 2,
    });
  }

  /** World-space rectangle visible in the viewport. */
  get bounds(): Rect {
    const tl = this.screen_to_world({ x: 0, y: 0 });
    const br = this.screen_to_world({
      x: this.viewport_w,
      y: this.viewport_h,
    });
    return {
      x: tl.x,
      y: tl.y,
      width: br.x - tl.x,
      height: br.y - tl.y,
    };
  }

  // ─── mutators ─────────────────────────────────────────────────────────────

  /** Translate the camera by a screen-space delta. */
  pan(delta_screen: Vec2): void {
    const t = this._transform;
    this.set_transform([
      [t[0][0], t[0][1], t[0][2] + delta_screen.x],
      [t[1][0], t[1][1], t[1][2] + delta_screen.y],
    ]);
  }

  /**
   * Multiply zoom by `factor` keeping `origin_screen` fixed in world space.
   * Used by wheel-zoom-at-cursor and pinch-zoom.
   */
  zoom_at(factor: number, origin_screen: Vec2): void {
    const t = this._transform;
    const s = t[0][0];
    const s2 = s * factor;
    // Solve T'(p_world) = origin_screen for tx', ty' where
    //   p_world = inverse(T)(origin_screen).
    const tx2 = origin_screen.x * (1 - factor) + factor * t[0][2];
    const ty2 = origin_screen.y * (1 - factor) + factor * t[1][2];
    this.set_transform([
      [s2, 0, tx2],
      [0, s2, ty2],
    ]);
  }

  /** Pan so `c` lands at the viewport center. Zoom unchanged. */
  set_center(c: Vec2): void {
    const s = this._transform[0][0];
    const tx = this.viewport_w / 2 - s * c.x;
    const ty = this.viewport_h / 2 - s * c.y;
    this.set_transform([
      [s, 0, tx],
      [0, s, ty],
    ]);
  }

  /** Set zoom directly; pivot defaults to viewport center. */
  set_zoom(z: number, pivot_screen?: Vec2): void {
    const current = this._transform[0][0];
    if (current === 0) return;
    const factor = z / current;
    const pivot = pivot_screen ?? {
      x: this.viewport_w / 2,
      y: this.viewport_h / 2,
    };
    this.zoom_at(factor, pivot);
  }

  /**
   * Replace the entire transform.
   *
   * Idempotent: when the new transform is element-wise equal to the current
   * one, this is a no-op (no notification fires). This is the seam that
   * makes external constraint loops (e.g. "subscribe → compute clamped →
   * set_transform") terminate: the clamp re-emits the same transform on
   * the second pass, set_transform short-circuits, no recursion.
   *
   * When `camera.constraints` is non-null, the input transform is clamped
   * synchronously before being stored — every public mutation respects the
   * constraint automatically.
   */
  set_transform(t: cmath.Transform): void {
    const next = this.apply_constraints(t);
    if (transform_equal(this._transform, next)) return;
    this._transform = next;
    this.notify();
  }

  /** Viewport size in screen pixels. Read by host code computing constraints. */
  get viewport_size(): { width: number; height: number } {
    return { width: this.viewport_w, height: this.viewport_h };
  }

  /**
   * Fit a target into the viewport.
   *
   * - `"<root>"` — the document root's content bounds (host-resolved).
   * - `"<selection>"` — current editor.state.selection's union bounds.
   * - `NodeId` — that node's content bounds.
   * - `Rect` — an explicit world-space rectangle.
   *
   * No-ops if the target resolves to `null` (e.g. empty selection) or if
   * the viewport size is 0 (no container).
   */
  fit(
    target: "<root>" | "<selection>" | NodeId | Rect,
    opts?: { margin?: number }
  ): void {
    if (this.viewport_w <= 0 || this.viewport_h <= 0) return;
    // A Rect target is its own bounds — no need to ask the resolver. Named
    // targets ("<root>", "<selection>") and NodeIds (strings) go through the
    // resolver. This split keeps the resolver simple (host doesn't need to
    // implement Rect-passthrough).
    const rect: Rect | null =
      typeof target === "string" ? this.resolve_bounds(target) : target;
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const margin = opts?.margin ?? DEFAULT_FIT_MARGIN;
    const viewport: Rect = {
      x: 0,
      y: 0,
      width: this.viewport_w,
      height: this.viewport_h,
    };
    this.set_transform(
      cmath.ext.viewport.transformToFit(viewport, rect, margin)
    );
  }

  /** Snap back to identity. */
  reset(): void {
    this.set_transform(cmath.transform.identity);
  }

  // ─── subscription (transient channel, does NOT bump state.version) ──────

  /**
   * Subscribe to camera changes. Fires on every mutation. Cheap channel —
   * does NOT bump `editor.state.version`. Same pattern as
   * `editor.subscribe_surface_hover`.
   */
  subscribe(cb: () => void): Unsubscribe {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ─── internal — called by the DOM surface ──────────────────────────────

  /** @internal Surface drives this on container resize. */
  _set_viewport_size(w: number, h: number): void {
    if (w === this.viewport_w && h === this.viewport_h) return;
    this.viewport_w = w;
    this.viewport_h = h;
    // Viewport size changes can shift the constraint's valid range
    // (e.g. cover's min_zoom depends on viewport / bounds aspect). Re-clamp
    // the stored transform; this might bump it to a new value. Either way
    // notify, because `center` / `bounds` derive from viewport size.
    if (this._constraints) {
      const next = this.apply_constraints(this._transform);
      if (!transform_equal(this._transform, next)) this._transform = next;
    }
    this.notify();
  }

  // ─── helpers ────────────────────────────────────────────────────────────

  /** Convert a screen-space point to world-space. */
  screen_to_world(p: Vec2): Vec2 {
    const inv = cmath.transform.invert(this._transform);
    const [wx, wy] = cmath.vector2.transform([p.x, p.y], inv);
    return { x: wx, y: wy };
  }

  /** Convert a world-space point to screen-space. */
  world_to_screen(p: Vec2): Vec2 {
    const [sx, sy] = cmath.vector2.transform([p.x, p.y], this._transform);
    return { x: sx, y: sy };
  }

  /**
   * Apply the current constraint (if any) to a candidate transform.
   * Pure: returns the clamped result, never mutates state. Returns the
   * input unchanged when constraints are null / bounds are unresolvable /
   * viewport is 0.
   */
  private apply_constraints(t: cmath.Transform): cmath.Transform {
    if (!this._constraints) return t;
    if (this.viewport_w <= 0 || this.viewport_h <= 0) return t;
    switch (this._constraints.type) {
      case "cover":
        return clamp_cover(
          t,
          this._constraints,
          this.viewport_w,
          this.viewport_h,
          this.resolve_bounds
        );
    }
  }

  /**
   * Re-clamp the stored transform against the current constraint. Called
   * from the `constraints` setter; `_set_viewport_size` has its own
   * notify-inclusive path.
   */
  private reenforce(): void {
    if (!this._constraints) return;
    const next = this.apply_constraints(this._transform);
    if (transform_equal(this._transform, next)) return;
    this._transform = next;
    this.notify();
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }
}

/**
 * Clamp a transform under a `'cover'` constraint:
 * - Zoom lower-bounded at fit-with-padding (the slide always fills the
 *   viewport edge-to-edge).
 * - When at min-zoom the slide is locked centered (bounds smaller than
 *   viewport on the constrained axis is impossible above min_zoom; below
 *   is impossible because zoom is clamped up).
 * - When zoomed in, pan is clamped so the slide always covers the viewport
 *   (no black bars).
 *
 * Returns the input transform unchanged when bounds can't be resolved or
 * are degenerate.
 */
function clamp_cover(
  t: cmath.Transform,
  c: Extract<CameraConstraints, { type: "cover" }>,
  vp_w: number,
  vp_h: number,
  resolve: BoundsResolver
): cmath.Transform {
  const bounds: Rect | null =
    typeof c.bounds === "string" ? resolve(c.bounds) : c.bounds;
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return t;
  const padding = c.padding ?? 0;
  const eff_w = vp_w - 2 * padding;
  const eff_h = vp_h - 2 * padding;
  if (eff_w <= 0 || eff_h <= 0) return t;
  const min_zoom = Math.min(eff_w / bounds.width, eff_h / bounds.height);
  const s = Math.max(t[0][0], min_zoom);
  const sw = s * bounds.width;
  const sh = s * bounds.height;
  // Math.max guards cmath.clamp against an inverted (min > max) range when
  // a caller passes a negative pan_overshoot.
  const o = Math.max(0, c.pan_overshoot ?? 0);
  // X axis. Slide wider than viewport → clamp pan; otherwise → center.
  const tx =
    sw > vp_w
      ? cmath.clamp(
          t[0][2],
          vp_w - s * (bounds.x + bounds.width) - o,
          -s * bounds.x + o
        )
      : (vp_w - sw) / 2 - s * bounds.x;
  // Y axis — same logic.
  const ty =
    sh > vp_h
      ? cmath.clamp(
          t[1][2],
          vp_h - s * (bounds.y + bounds.height) - o,
          -s * bounds.y + o
        )
      : (vp_h - sh) / 2 - s * bounds.y;
  return [
    [s, 0, tx],
    [0, s, ty],
  ];
}

/** Default margin for `camera.fit(...)` when caller doesn't specify. */
export const DEFAULT_FIT_MARGIN = 64;

function transform_equal(a: cmath.Transform, b: cmath.Transform): boolean {
  return (
    a[0][0] === b[0][0] &&
    a[0][1] === b[0][1] &&
    a[0][2] === b[0][2] &&
    a[1][0] === b[1][0] &&
    a[1][1] === b[1][1] &&
    a[1][2] === b[1][2]
  );
}
