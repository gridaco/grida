// Demo-only parametric star geometry. Used by §15 to exercise the
// universal `surface.setParametricHandles` primitive against a shape
// hud doesn't know about — the host paints the star on a custom
// `<canvas>` underlay (no SVG fixture), and feeds hud three handles
// (tip-radius, inner/outer ratio, point-count).
//
// Out-of-scope: rounded-corner star path rendering. The handles
// visualize their host-owned values; the polygon stays sharp. If a
// real rounded-tip render is needed later it's a separate PR against
// this file.

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
  constructor(public readonly params: ParametricStarParams) {}

  /**
   * The polygon vertices, doc-space. 2N vertices for N points,
   * alternating outer / inner. Starts at the first OUTER tip (the
   * one at angle `-π/2 + rotation`) and walks counter-clockwise.
   */
  polygon(): Array<[number, number]> {
    const { cx, cy, outerR, innerR, points, rotation = 0 } = this.params;
    const N = Math.max(3, Math.floor(points));
    const verts: Array<[number, number]> = [];
    const step = Math.PI / N;
    for (let i = 0; i < N * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = -Math.PI / 2 + rotation + i * step;
      verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
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
   * Paint the star into a Canvas 2D context, in DOC SPACE — caller
   * must have already applied the camera transform via `ctx.setTransform`.
   *
   * Sharp-cornered polygon; rounded corners are deliberately not
   * rendered (out-of-scope for the demo, see file header).
   */
  paint(ctx: CanvasRenderingContext2D, style: ParametricStarStyle): void {
    const verts = this.polygon();
    if (verts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < verts.length; i++) {
      ctx.lineTo(verts[i][0], verts[i][1]);
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
}
