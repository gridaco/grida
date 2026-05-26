import type cmath from "@grida/cmath";
import type {
  HUDDraw,
  HUDLine,
  HUDPaint,
  HUDPoint,
  HUDPolyline,
  HUDRect,
  HUDRule,
  HUDScreenRect,
} from "./types";
import { resolvePaint } from "./paint";
import { drawPixelGrid, type PixelGridConfig } from "./pixel-grid";
import { drawRuler, type RulerConfig } from "./ruler";
import {
  drawCornerRadius,
  type CornerRadiusHandleLayout,
} from "./corner-radius";
import {
  drawParametricHandles,
  type ParametricHandleLayout,
} from "./parametric-handle";

const DEFAULT_COLOR = "#f44336";
const DEFAULT_LABEL_FG = "#ffffff";
const DEFAULT_LINE_WIDTH = 0.5;
const CROSSHAIR_SIZE = 4;
const LABEL_FONT = "10px sans-serif";
const LABEL_FONT_HEIGHT = 14;
const LABEL_PADDING_X = 4;
const LABEL_PADDING_Y = 2;
const LABEL_BORDER_RADIUS = 4;
const LABEL_OFFSET = 16;
const SCREEN_RECT_LINE_WIDTH = 1;

export interface HUDCanvasOptions {
  color?: string;
}

/**
 * Imperative Canvas 2D renderer for the HUD overlay.
 *
 * Owns a single `<canvas>` element and draws {@link HUDDraw} command lists
 * each frame. All drawing is immediate-mode: the canvas is cleared and
 * fully redrawn on every `draw()` call.
 *
 * The viewport transform is assumed to be axis-aligned (scale + translate only,
 * no rotation/shear). The off-diagonal components of the transform matrix are
 * ignored.
 */
export class HUDCanvas {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private transform: cmath.Transform = [
    [1, 0, 0],
    [0, 1, 0],
  ];
  private color: string;
  private width = 0;
  private height = 0;
  private pixelGrid: PixelGridConfig | null = null;
  private ruler: RulerConfig | null = null;
  private cornerRadiusHandles: readonly CornerRadiusHandleLayout[] | null =
    null;
  private parametricHandles: readonly ParametricHandleLayout[] | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    options?: HUDCanvasOptions
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.color = options?.color ?? DEFAULT_COLOR;
  }

  setColor(color?: string) {
    this.color = color ?? DEFAULT_COLOR;
  }

  setSize(w: number, h: number) {
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    if (this.width === w && this.height === h && this.dpr === dpr) return;
    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  setTransform(transform: cmath.Transform) {
    this.transform = transform;
  }

  /**
   * Configure the back-most pixel-grid layer. Pass `null` to disable.
   * Drawn before any HUD primitive, gated by `zoomThreshold`. See
   * `PixelGridConfig.transform` for the two-transform contract.
   */
  setPixelGrid(config: PixelGridConfig | null) {
    if (config === null) {
      this.pixelGrid = null;
      return;
    }
    // Preserve the last-known transform when the caller omits one — lets
    // hosts toggle `enabled` without re-supplying the camera state.
    this.pixelGrid = {
      ...config,
      transform: config.transform ?? this.pixelGrid?.transform,
    };
  }

  /**
   * Update only the pixel grid's transform, without replacing the rest of
   * the config. Cheap to call per camera tick.
   */
  setPixelGridTransform(transform: cmath.Transform) {
    if (this.pixelGrid) {
      this.pixelGrid = { ...this.pixelGrid, transform };
    }
  }

  /**
   * Configure the top-most ruler chrome (top + left strips). Pass `null`
   * to disable. Painted LAST in the frame — after the pixel grid,
   * selection chrome, marquee, handles, size meter, and host extras —
   * so the strips visually frame the viewport instead of being clipped
   * by anything drawn at the edges. See `RulerConfig.transform` for
   * the two-transform contract — same shape as the pixel grid.
   *
   * Paint-order rationale: pixel grid is a substrate (content-space,
   * the user reads it "under" the document), ruler is a frame
   * (viewport-space, the user reads it "around" the document). Frames
   * sit on top of everything they frame; substrates sit beneath. See
   * the README "Render path" section.
   */
  setRuler(config: RulerConfig | null) {
    if (config === null) {
      this.ruler = null;
      return;
    }
    // Preserve the last-known transform when the caller omits one, mirroring
    // the pixel-grid behavior so hosts can toggle `enabled` cheaply.
    this.ruler = {
      ...config,
      transform: config.transform ?? this.ruler?.transform,
    };
  }

  /**
   * Update only the ruler's transform. Cheap to call per camera tick.
   * No-op when no ruler config is set.
   */
  setRulerTransform(transform: cmath.Transform) {
    if (this.ruler) {
      this.ruler = { ...this.ruler, transform };
    }
  }

  /**
   * Configure the corner-radius handle overlay. Pass `null` to clear.
   *
   * Painted in the chrome band — ABOVE the surface's selection
   * outlines / resize knobs / host extras (which is the "handles, not
   * frame" band) and BELOW the ruler (the frame strip). The position
   * inside the chrome band — strictly above `screenRects` — matches
   * the layered-handle convention: a feature-specific knob always
   * sits over the generic resize chrome that draws under it.
   *
   * Hit-test entries are NOT registered from here; the Surface owns
   * the registry and pushes corner-radius regions alongside its
   * regular chrome regions. Render and hit live on independent
   * shapes per the package's render/hit asymmetry rule.
   */
  setCornerRadiusHandles(handles: readonly CornerRadiusHandleLayout[] | null) {
    this.cornerRadiusHandles = handles;
  }

  /**
   * Push the per-frame parametric-handle layouts. Painted in the same
   * z-band as corner-radius handles (knob, not frame) — feature-
   * specific knobs above generic resize chrome, below marquee/lasso
   * and the ruler.
   *
   * Hit-test entries are NOT registered here; the Surface owns the
   * registry and pushes parametric regions alongside its other
   * chrome regions. Render and hit live on independent shapes per the
   * package's render/hit asymmetry rule.
   */
  setParametricHandles(handles: readonly ParametricHandleLayout[] | null) {
    this.parametricHandles = handles;
  }

  /**
   * Clear the canvas and draw all primitives in `commands`.
   * Pass `undefined` to clear without drawing (e.g. when no overlay is active).
   */
  draw(commands: HUDDraw | undefined) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // ── back-most: pixel-grid (substrate, content-space) ──────────────
    // Painted first so it reads "under" every interaction surface. The
    // user aligns content to it; chrome and content sit on top.
    const pg = this.pixelGrid;
    const pgTransform = pg?.transform ?? this.transform;
    if (pg?.enabled && pgTransform[0][0] > pg.zoomThreshold) {
      drawPixelGrid({
        ctx,
        transform: pgTransform,
        width: this.width,
        height: this.height,
        dpr: this.dpr,
        color: pg.color,
        steps: pg.steps,
      });
    }

    if (commands) {
      const { lines, rules, points, rects, polylines, screenRects } = commands;

      if (rules && rules.length > 0) this.drawRules(rules);
      if (rects && rects.length > 0) this.drawRects(rects);
      if (polylines && polylines.length > 0) this.drawPolylines(polylines);
      if (lines && lines.length > 0) this.drawLines(lines);
      if (points && points.length > 0) this.drawPoints(points);
      if (screenRects && screenRects.length > 0)
        this.drawScreenRects(screenRects);
    }

    // Corner-radius handles sit ABOVE the chrome band's `screenRects`
    // (selection / resize / endpoint knobs) so a feature-specific knob
    // is never occluded by the generic resize chrome that draws
    // beneath it. They stay BELOW `topRects` (marquee / lasso) — the
    // "live region the user is drawing" rule applies to corner-radius
    // too: a marquee crossing the canvas during selection wins
    // visually. Painted outside the `if (commands)` guard so it
    // honors the configured handles regardless of whether the host
    // passes an explicit `HUDDraw`.
    const crh = this.cornerRadiusHandles;
    if (crh && crh.length > 0) {
      drawCornerRadius({
        ctx,
        transform: this.transform,
        width: this.width,
        height: this.height,
        dpr: this.dpr,
        handles: crh,
        color: this.color,
      });
    }

    // Parametric handles — painted in the same z-band as corner-radius
    // (they're the same affordance family). Independent painter so the
    // two slots can be removed independently when corner-radius
    // migrates entirely onto the parametric primitive.
    const ph = this.parametricHandles;
    if (ph && ph.length > 0) {
      drawParametricHandles({
        ctx,
        transform: this.transform,
        width: this.width,
        height: this.height,
        dpr: this.dpr,
        handles: ph,
        color: this.color,
      });
    }

    if (commands) {
      const { topRects, topPolylines } = commands;
      // Top layer within the chrome pass — painted after the regular
      // primitives AND the corner-radius handles so marquee / lasso
      // always dominate the knobs, handles, and outlines beneath
      // them. See `HUDDraw.topRects` / `HUDDraw.topPolylines`. Still
      // beneath the ruler (see below).
      if (topRects && topRects.length > 0) this.drawRects(topRects);
      if (topPolylines && topPolylines.length > 0)
        this.drawPolylines(topPolylines);
    }

    // ── top-most: ruler (frame, viewport-space) ───────────────────────
    // Painted LAST — after pixel grid, surface chrome, and host extras
    // — so the L-shaped strip frames the editing area instead of being
    // crossed by selection outlines, marquee, handles, or extras that
    // extend to the viewport edge. Pixel-grid stays back-most because
    // it is a substrate; ruler is a frame. Different chrome families,
    // different paint-order constraints.
    const r = this.ruler;
    const rTransform = r?.transform ?? this.transform;
    if (r?.enabled) {
      drawRuler({
        ctx,
        transform: rTransform,
        width: this.width,
        height: this.height,
        dpr: this.dpr,
        config: r,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------------

  private applyViewTransform() {
    const [[sx, , tx], [, sy, ty]] = this.transform;
    this.ctx.setTransform(
      sx * this.dpr,
      0,
      0,
      sy * this.dpr,
      tx * this.dpr,
      ty * this.dpr
    );
  }

  private applyScreenTransform() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Project a scalar offset on `axis` to screen-space. */
  private deltaToScreen(offset: number, axis: "x" | "y"): number {
    const i = axis === "x" ? 0 : 1;
    const row = this.transform[i];
    return row[i] * offset + row[2];
  }

  // ---------------------------------------------------------------------------
  // Primitive renderers
  // ---------------------------------------------------------------------------

  private drawRules(rules: HUDRule[]) {
    const ctx = this.ctx;
    this.applyScreenTransform();
    ctx.lineWidth = DEFAULT_LINE_WIDTH;

    let currentWidth = DEFAULT_LINE_WIDTH;
    for (const rule of rules) {
      const w = rule.strokeWidth ?? DEFAULT_LINE_WIDTH;
      if (w !== currentWidth) {
        ctx.lineWidth = w;
        currentWidth = w;
      }
      const screenOffset = this.deltaToScreen(rule.offset, rule.axis);
      const { style: rStyle, opacity: rOpacity } = this.resolvePaintOrFallback(
        rule.strokePaint,
        rule.color ?? this.color,
        1
      );
      ctx.strokeStyle = rStyle;
      if (rOpacity !== 1) ctx.globalAlpha = rOpacity;
      ctx.beginPath();
      if (rule.axis === "x") {
        ctx.moveTo(screenOffset, 0);
        ctx.lineTo(screenOffset, this.height);
      } else {
        ctx.moveTo(0, screenOffset);
        ctx.lineTo(this.width, screenOffset);
      }
      ctx.stroke();
      if (rOpacity !== 1) ctx.globalAlpha = 1;
    }
  }

  /**
   * Resolve an optional `HUDPaint` to a Canvas 2D fill/stroke value,
   * falling back to the legacy `color` + `opacity` fields when absent.
   *
   * Used by the primitive renderers to switch through `HUDPaint` when
   * present; the legacy color path is preserved for callers that haven't
   * adopted paint yet. Pattern resolution happens here — including the
   * counter-CTM transform that keeps stripes screen-aligned.
   */
  private resolvePaintOrFallback(
    paint: HUDPaint | undefined,
    fallbackColor: string,
    fallbackOpacity: number
  ): { style: string | CanvasPattern; opacity: number } {
    if (paint) return resolvePaint(this.ctx, paint, this.dpr);
    return { style: fallbackColor, opacity: fallbackOpacity };
  }

  private drawLines(lines: HUDLine[]) {
    const ctx = this.ctx;
    const zoom = this.transform[0][0];
    const [[sx, , tx], [, sy, ty]] = this.transform;

    // -- strokes in document space --
    this.applyViewTransform();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = DEFAULT_LINE_WIDTH / zoom;

    let dashed = false;
    let currentWidth = DEFAULT_LINE_WIDTH;
    for (const line of lines) {
      if (line.dashed && !dashed) {
        ctx.setLineDash([4 / zoom, 3 / zoom]);
        dashed = true;
      } else if (!line.dashed && dashed) {
        ctx.setLineDash([]);
        dashed = false;
      }
      const w = line.strokeWidth ?? DEFAULT_LINE_WIDTH;
      if (w !== currentWidth) {
        ctx.lineWidth = w / zoom;
        currentWidth = w;
      }
      const { style, opacity } = this.resolvePaintOrFallback(
        line.strokePaint,
        line.color ?? this.color,
        1
      );
      ctx.strokeStyle = style;
      if (opacity !== 1) ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
      if (opacity !== 1) ctx.globalAlpha = 1;
    }
    if (dashed) ctx.setLineDash([]);

    // -- labels in screen space --
    this.applyScreenTransform();
    ctx.font = LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const line of lines) {
      if (!line.label) continue;

      const midX = (line.x1 + line.x2) / 2;
      const midY = (line.y1 + line.y2) / 2;
      const lx = sx * midX + tx;
      const ly = sy * midY + ty;

      const angle = line.labelAngle ?? 0;
      // Offset label perpendicular to line direction. When `labelAngle`
      // is set, the offset is rotated by `angle` so the pill sits
      // outside the rotated artwork's bottom edge (size meter on a
      // rotated selection).
      const isVertical =
        Math.abs(line.x2 - line.x1) < Math.abs(line.y2 - line.y1);
      const baseOffsetX = isVertical ? LABEL_OFFSET : 0;
      const baseOffsetY = isVertical ? 0 : LABEL_OFFSET;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const labelX = lx + baseOffsetX * cos - baseOffsetY * sin;
      const labelY = ly + baseOffsetX * sin + baseOffsetY * cos;

      const metrics = ctx.measureText(line.label);
      const tw = metrics.width + LABEL_PADDING_X * 2;
      const th = LABEL_FONT_HEIGHT + LABEL_PADDING_Y * 2;

      // Rotate the pill + text around the label center when `labelAngle`
      // is set. Cheap save/restore; only the pill draw is wrapped.
      if (angle !== 0) {
        ctx.save();
        ctx.translate(labelX, labelY);
        ctx.rotate(angle);
        ctx.translate(-labelX, -labelY);
      }

      // background pill
      ctx.fillStyle = line.color ?? this.color;
      ctx.beginPath();
      ctx.roundRect(
        labelX - tw / 2,
        labelY - th / 2,
        tw,
        th,
        LABEL_BORDER_RADIUS
      );
      ctx.fill();

      // text
      ctx.fillStyle = DEFAULT_LABEL_FG;
      ctx.fillText(line.label, labelX, labelY);

      if (angle !== 0) ctx.restore();
    }
  }

  private drawRects(rects: HUDRect[]) {
    const ctx = this.ctx;
    const zoom = this.transform[0][0];

    this.applyViewTransform();
    ctx.lineWidth = DEFAULT_LINE_WIDTH / zoom;
    let currentWidth = DEFAULT_LINE_WIDTH;

    for (const rect of rects) {
      const doStroke = rect.stroke !== false;
      const doFill = rect.fill === true;
      const color = rect.color ?? this.color;

      if (rect.dashed) {
        ctx.setLineDash([4 / zoom, 3 / zoom]);
      }

      if (doFill) {
        const { style, opacity } = this.resolvePaintOrFallback(
          rect.fillPaint,
          color,
          rect.fillOpacity ?? 1
        );
        ctx.globalAlpha = opacity;
        ctx.fillStyle = style;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.globalAlpha = 1;
      }

      if (doStroke) {
        const w = rect.strokeWidth ?? DEFAULT_LINE_WIDTH;
        if (w !== currentWidth) {
          ctx.lineWidth = w / zoom;
          currentWidth = w;
        }
        const { style, opacity } = this.resolvePaintOrFallback(
          rect.strokePaint,
          color,
          1
        );
        ctx.strokeStyle = style;
        if (opacity !== 1) ctx.globalAlpha = opacity;
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        if (opacity !== 1) ctx.globalAlpha = 1;
      }

      if (rect.dashed) {
        ctx.setLineDash([]);
      }
    }
  }

  private drawPolylines(polylines: HUDPolyline[]) {
    const ctx = this.ctx;
    const zoom = this.transform[0][0];

    this.applyViewTransform();

    for (const poly of polylines) {
      if (poly.points.length < 2) continue;

      // Per-polyline strokeWidth (screen-px). Divided by zoom so doc-space
      // rendering produces the requested screen-px thickness. Falls back to
      // the canvas default (1px) when absent.
      const sw = poly.strokeWidth ?? DEFAULT_LINE_WIDTH;
      ctx.lineWidth = sw / zoom;

      ctx.beginPath();
      ctx.moveTo(poly.points[0][0], poly.points[0][1]);
      for (let i = 1; i < poly.points.length; i++) {
        ctx.lineTo(poly.points[i][0], poly.points[i][1]);
      }

      const doFill = poly.fill === true;
      const doStroke = poly.stroke !== false;
      const color = poly.color ?? this.color;

      if (doFill) {
        ctx.closePath();
        const { style, opacity } = this.resolvePaintOrFallback(
          poly.fillPaint,
          color,
          poly.fillOpacity ?? 1
        );
        ctx.globalAlpha = opacity;
        ctx.fillStyle = style;
        ctx.fill("evenodd");
        ctx.globalAlpha = 1;
      }

      if (doStroke) {
        if (poly.dashed) {
          ctx.setLineDash([4 / zoom, 3 / zoom]);
        }
        const { style, opacity } = this.resolvePaintOrFallback(
          poly.strokePaint,
          color,
          poly.strokeOpacity ?? 1
        );
        if (opacity !== 1) ctx.globalAlpha = opacity;
        ctx.strokeStyle = style;
        ctx.stroke();
        if (opacity !== 1) ctx.globalAlpha = 1;
        if (poly.dashed) {
          ctx.setLineDash([]);
        }
      }
    }
  }

  private drawPoints(points: HUDPoint[]) {
    const ctx = this.ctx;
    this.applyScreenTransform();
    ctx.lineWidth = DEFAULT_LINE_WIDTH;

    const half = CROSSHAIR_SIZE / 2;
    const [[sx, , tx], [, sy, ty]] = this.transform;

    // Split into two batches: points with paint (stripes etc.) need a
    // fresh strokeStyle per point and can't be batched; points with only
    // solid color batch by color string as before.
    const paintPoints: HUDPoint[] = [];
    const colorBuckets = new Map<string, HUDPoint[]>();
    for (const p of points) {
      if (p.strokePaint) {
        paintPoints.push(p);
        continue;
      }
      const c = p.color ?? this.color;
      const arr = colorBuckets.get(c);
      if (arr) arr.push(p);
      else colorBuckets.set(c, [p]);
    }

    for (const [color, group] of colorBuckets) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (const p of group) {
        const scrX = sx * p.x + tx;
        const scrY = sy * p.y + ty;
        ctx.moveTo(scrX - half, scrY - half);
        ctx.lineTo(scrX + half, scrY + half);
        ctx.moveTo(scrX + half, scrY - half);
        ctx.lineTo(scrX - half, scrY + half);
      }
      ctx.stroke();
    }

    for (const p of paintPoints) {
      const { style, opacity } = this.resolvePaintOrFallback(
        p.strokePaint,
        p.color ?? this.color,
        1
      );
      ctx.strokeStyle = style;
      if (opacity !== 1) ctx.globalAlpha = opacity;
      const scrX = sx * p.x + tx;
      const scrY = sy * p.y + ty;
      ctx.beginPath();
      ctx.moveTo(scrX - half, scrY - half);
      ctx.lineTo(scrX + half, scrY + half);
      ctx.moveTo(scrX + half, scrY - half);
      ctx.lineTo(scrX - half, scrY + half);
      ctx.stroke();
      if (opacity !== 1) ctx.globalAlpha = 1;
    }
  }

  /**
   * Draw rects whose **size is in screen-space** but whose **anchor is in
   * document-space**. The doc-space point is projected via the current
   * transform; the rect is then drawn at fixed CSS-pixel dimensions.
   *
   * This is the primitive used to draw resize / rotate handles — they must
   * remain a constant visual size regardless of viewport zoom.
   */
  private drawScreenRects(rects: HUDScreenRect[]) {
    const ctx = this.ctx;
    const [[sx, , tx], [, sy, ty]] = this.transform;

    this.applyScreenTransform();
    ctx.lineWidth = SCREEN_RECT_LINE_WIDTH;

    for (const r of rects) {
      const scrX = sx * r.x + tx;
      const scrY = sy * r.y + ty;
      const w = r.width;
      const h = r.height;
      const anchor = r.anchor ?? "center";

      let x = scrX;
      let y = scrY;
      switch (anchor) {
        case "center":
          x = scrX - w / 2;
          y = scrY - h / 2;
          break;
        case "tl":
          x = scrX;
          y = scrY;
          break;
        case "tr":
          x = scrX - w;
          y = scrY;
          break;
        case "bl":
          x = scrX;
          y = scrY - h;
          break;
        case "br":
          x = scrX - w;
          y = scrY - h;
          break;
      }

      const doFill = r.fill !== false;
      const doStroke = r.stroke !== false;
      const angle = r.angle ?? 0;

      // Rotate around the rect's screen-space center when angle is set —
      // used to make handle knobs rotate together with a transformed
      // selection. Skip the matrix push when angle === 0 (most rects).
      if (angle !== 0) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.translate(-cx, -cy);
      }

      const shape = r.shape ?? "rect";
      if (shape === "circle") {
        // Ellipse inscribed in the same bbox. Hit AABB on the host side
        // remains the square — render/hit disagree by design (legibility
        // vs Fitts'). `ctx.ellipse(cx, cy, rx, ry, ...)` is widely
        // supported; no roundRect fallback needed.
        const ecx = x + w / 2;
        const ecy = y + h / 2;
        const rx = w / 2;
        const ry = h / 2;
        ctx.beginPath();
        ctx.ellipse(ecx, ecy, rx, ry, 0, 0, Math.PI * 2);
        if (doFill) {
          const { style, opacity } = this.resolvePaintOrFallback(
            r.fillPaint,
            r.fillColor ?? this.color,
            1
          );
          ctx.fillStyle = style;
          if (opacity !== 1) ctx.globalAlpha = opacity;
          ctx.fill();
          if (opacity !== 1) ctx.globalAlpha = 1;
        }
        if (doStroke) {
          const { style, opacity } = this.resolvePaintOrFallback(
            r.strokePaint,
            r.strokeColor ?? this.color,
            1
          );
          ctx.strokeStyle = style;
          if (opacity !== 1) ctx.globalAlpha = opacity;
          ctx.stroke();
          if (opacity !== 1) ctx.globalAlpha = 1;
        }
      } else {
        if (doFill) {
          const { style, opacity } = this.resolvePaintOrFallback(
            r.fillPaint,
            r.fillColor ?? this.color,
            1
          );
          ctx.fillStyle = style;
          if (opacity !== 1) ctx.globalAlpha = opacity;
          ctx.fillRect(x, y, w, h);
          if (opacity !== 1) ctx.globalAlpha = 1;
        }
        if (doStroke) {
          const { style, opacity } = this.resolvePaintOrFallback(
            r.strokePaint,
            r.strokeColor ?? this.color,
            1
          );
          ctx.strokeStyle = style;
          if (opacity !== 1) ctx.globalAlpha = opacity;
          ctx.strokeRect(x, y, w, h);
          if (opacity !== 1) ctx.globalAlpha = 1;
        }
      }

      if (angle !== 0) ctx.restore();
    }
  }
}
