import type cmath from "@grida/cmath";
import type {
  HUDDraw,
  HUDLine,
  HUDPolyline,
  HUDRect,
  HUDRule,
  HUDScreenRect,
} from "./types";

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
   * Clear the canvas and draw all primitives in `commands`.
   * Pass `undefined` to clear without drawing (e.g. when no overlay is active).
   */
  draw(commands: HUDDraw | undefined) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!commands) return;

    const { lines, rules, points, rects, polylines, screenRects } = commands;

    if (rules && rules.length > 0) this.drawRules(rules);
    if (rects && rects.length > 0) this.drawRects(rects);
    if (polylines && polylines.length > 0) this.drawPolylines(polylines);
    if (lines && lines.length > 0) this.drawLines(lines);
    if (points && points.length > 0) this.drawPoints(points);
    if (screenRects && screenRects.length > 0)
      this.drawScreenRects(screenRects);
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
    ctx.strokeStyle = this.color;
    ctx.lineWidth = DEFAULT_LINE_WIDTH;

    for (const { axis, offset } of rules) {
      const screenOffset = this.deltaToScreen(offset, axis);
      ctx.beginPath();
      if (axis === "x") {
        ctx.moveTo(screenOffset, 0);
        ctx.lineTo(screenOffset, this.height);
      } else {
        ctx.moveTo(0, screenOffset);
        ctx.lineTo(this.width, screenOffset);
      }
      ctx.stroke();
    }
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
    let currentColor = this.color;
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
      const c = line.color ?? this.color;
      if (c !== currentColor) {
        ctx.strokeStyle = c;
        currentColor = c;
      }
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
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

      // offset label perpendicular to line direction
      const isVertical =
        Math.abs(line.x2 - line.x1) < Math.abs(line.y2 - line.y1);
      const labelX = isVertical ? lx + LABEL_OFFSET : lx;
      const labelY = isVertical ? ly : ly + LABEL_OFFSET;

      const metrics = ctx.measureText(line.label);
      const tw = metrics.width + LABEL_PADDING_X * 2;
      const th = LABEL_FONT_HEIGHT + LABEL_PADDING_Y * 2;

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
        ctx.globalAlpha = rect.fillOpacity ?? 1;
        ctx.fillStyle = color;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.globalAlpha = 1;
      }

      if (doStroke) {
        const w = rect.strokeWidth ?? DEFAULT_LINE_WIDTH;
        if (w !== currentWidth) {
          ctx.lineWidth = w / zoom;
          currentWidth = w;
        }
        ctx.strokeStyle = color;
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
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
    ctx.lineWidth = DEFAULT_LINE_WIDTH / zoom;

    for (const poly of polylines) {
      if (poly.points.length < 2) continue;

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
        ctx.globalAlpha = poly.fillOpacity ?? 1;
        ctx.fillStyle = color;
        ctx.fill("evenodd");
        ctx.globalAlpha = 1;
      }

      if (doStroke) {
        if (poly.dashed) {
          ctx.setLineDash([4 / zoom, 3 / zoom]);
        }
        ctx.strokeStyle = color;
        ctx.stroke();
        if (poly.dashed) {
          ctx.setLineDash([]);
        }
      }
    }
  }

  private drawPoints(points: cmath.Vector2[]) {
    const ctx = this.ctx;
    this.applyScreenTransform();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = DEFAULT_LINE_WIDTH;

    const half = CROSSHAIR_SIZE / 2;
    const [[sx, , tx], [, sy, ty]] = this.transform;

    ctx.beginPath();
    for (const [px, py] of points) {
      const scrX = sx * px + tx;
      const scrY = sy * py + ty;
      ctx.moveTo(scrX - half, scrY - half);
      ctx.lineTo(scrX + half, scrY + half);
      ctx.moveTo(scrX + half, scrY - half);
      ctx.lineTo(scrX - half, scrY + half);
    }
    ctx.stroke();
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

      if (doFill) {
        ctx.fillStyle = r.fillColor ?? this.color;
        ctx.fillRect(x, y, w, h);
      }
      if (doStroke) {
        ctx.strokeStyle = r.strokeColor ?? this.color;
        ctx.strokeRect(x, y, w, h);
      }
    }
  }
}
