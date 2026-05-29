// Demo-only parametric star geometry. Used by §15 to exercise the
// universal `surface.setParametricHandles` primitive against a shape
// hud doesn't know about — the host paints the star on a custom
// `<canvas>` underlay (no SVG fixture), and feeds hud three handles
// (corner-radius, inner/outer ratio, point-count).
//
// Corner-radius rounding (paint side): when `style.cornerRadius > 0`
// the painter rounds every polygon corner uniformly via `arcTo`. The
// per-corner cap is `(min_incident_edge / 2) · tan(θ/2)` where θ is
// the unsigned angle between the corner's edge vectors — the tightest
// constraint that prevents adjacent fillets from overlapping or
// `arcTo` from overshooting. Star tips have very acute θ, so this
// cap dominates the half-edge constraint. The polygon geometry itself
// stays sharp (hit-test, AABB, etc. don't change); rounding lives only
// in the paint path.

export interface ParametricStarParams {
  /** Star center, doc-space. */
  cx: number;
  cy: number;
  /** Outer (tip) radius. */
  outerR: number;
  /** Inner (valley) radius. Must be < outerR for a star shape. */
  innerR: number;
  /** Number of points (>= 3). Stepped — host snaps to integers. */
  points: number;
  /** Rotation around `(cx, cy)` in radians. 0 → first tip points UP. */
  rotation?: number;
}

export class ParametricStar {
  // Instance caches — safe because `ParametricStar` is constructed
  // fresh whenever its params change (the demo's useMemo on
  // [innerR, pointCount]). Same params → reused instance → cached
  // polygon and max-radius, no per-frame recomputation.
  private _polygon: Array<[number, number]> | null = null;
  private _maxR: number | null = null;

  constructor(public readonly params: ParametricStarParams) {}

  /**
   * The polygon vertices, doc-space. 2N vertices for N points,
   * alternating outer / inner. Starts at the first OUTER tip (the
   * one at angle `-π/2 + rotation`) and walks counter-clockwise.
   */
  polygon(): Array<[number, number]> {
    if (this._polygon) return this._polygon;
    const { cx, cy, outerR, innerR, points, rotation = 0 } = this.params;
    const N = Math.max(3, Math.floor(points));
    const verts: Array<[number, number]> = [];
    const step = Math.PI / N;
    for (let i = 0; i < N * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = -Math.PI / 2 + rotation + i * step;
      verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    this._polygon = verts;
    return verts;
  }

  /** Doc-space position of the i-th outer tip. */
  outerTip(i: number): [number, number] {
    const { cx, cy, outerR, points, rotation = 0 } = this.params;
    const N = Math.max(3, Math.floor(points));
    const a = -Math.PI / 2 + rotation + ((i % N) * (2 * Math.PI)) / N;
    return [cx + outerR * Math.cos(a), cy + outerR * Math.sin(a)];
  }

  /**
   * Doc-space position of the inner valley CCW from the i-th outer
   * tip — i.e. the inner vertex between tip i and tip i+1.
   */
  innerValleyAfterTip(i: number): [number, number] {
    const { cx, cy, innerR, points, rotation = 0 } = this.params;
    const N = Math.max(3, Math.floor(points));
    const step = Math.PI / N;
    const a = -Math.PI / 2 + rotation + (i * 2 + 1) * step;
    return [cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)];
  }

  /** Axis-aligned bounding box of the polygon. */
  aabb(): { x: number; y: number; width: number; height: number } {
    const verts = this.polygon();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of verts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /** Even-odd ray-cast point-in-polygon. Closed polygon (last→first). */
  contains(px: number, py: number): boolean {
    const poly = this.polygon();
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Maximum corner radius the polygon admits without `arcTo` fillets
   * overshooting or overlapping. The limit per-corner is
   * `(min_incident_edge / 2) · tan(θ/2)` where θ is the unsigned angle
   * at that corner; the polygon-wide max is the min across all corners.
   * Star tips have very acute θ, so this cap is much tighter than half
   * the edge length and dominates the limit.
   */
  maxCornerRadius(): number {
    if (this._maxR !== null) return this._maxR;
    const verts = this.polygon();
    if (verts.length < 3) return (this._maxR = 0);
    const n = verts.length;
    let max = Infinity;
    for (let i = 0; i < n; i++) {
      const prev = verts[(i - 1 + n) % n];
      const cur = verts[i];
      const next = verts[(i + 1) % n];
      const ux = prev[0] - cur[0];
      const uy = prev[1] - cur[1];
      const vx = next[0] - cur[0];
      const vy = next[1] - cur[1];
      const lenU = Math.hypot(ux, uy);
      const lenV = Math.hypot(vx, vy);
      // Fail-closed on any degenerate corner: a zero-length edge means
      // adjacent verts coincide, and `arcTo` over coincident points is
      // implementation-defined. Better to disable rounding entirely
      // than skip the corner and let paint() emit undefined output.
      if (lenU === 0 || lenV === 0) return (this._maxR = 0);
      const cosT = Math.max(
        -1,
        Math.min(1, (ux * vx + uy * vy) / (lenU * lenV))
      );
      const theta = Math.acos(cosT);
      const halfEdge = Math.min(lenU, lenV) / 2;
      const cornerMax = halfEdge * Math.tan(theta / 2);
      if (cornerMax < max) max = cornerMax;
    }
    return (this._maxR = Number.isFinite(max) ? Math.max(0, max) : 0);
  }

  /**
   * Paint the star into a Canvas 2D context, in DOC SPACE — caller
   * must have already applied the camera transform via `ctx.setTransform`.
   *
   * When `style.cornerRadius > 0` every polygon corner is rounded
   * uniformly via `arcTo`. The radius is clamped to {@link maxCornerRadius}
   * so adjacent fillets can never overlap and `arcTo` never overshoots
   * the corner.
   */
  paint(ctx: CanvasRenderingContext2D, style: ParametricStarStyle): void {
    const verts = this.polygon();
    if (verts.length < 3) return;
    const r = Math.max(0, style.cornerRadius ?? 0);
    ctx.beginPath();
    if (r <= 0) {
      ctx.moveTo(verts[0][0], verts[0][1]);
      for (let i = 1; i < verts.length; i++) {
        ctx.lineTo(verts[i][0], verts[i][1]);
      }
    } else {
      const n = verts.length;
      const clamped = Math.min(r, this.maxCornerRadius());
      // Start at the midpoint of the first edge so the first `arcTo`
      // has a defined "current point" for its incoming tangent.
      const start: [number, number] = [
        (verts[0][0] + verts[1][0]) / 2,
        (verts[0][1] + verts[1][1]) / 2,
      ];
      ctx.moveTo(start[0], start[1]);
      for (let i = 1; i <= n; i++) {
        const corner = verts[i % n];
        const next = verts[(i + 1) % n];
        ctx.arcTo(corner[0], corner[1], next[0], next[1], clamped);
      }
    }
    ctx.closePath();
    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill();
    }
    if (style.stroke) {
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.strokeWidth ?? 1;
      ctx.stroke();
    }
  }
}

export interface ParametricStarStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Per-corner fillet radius, doc-space. 0 (or omitted) = sharp polygon. */
  cornerRadius?: number;
}
