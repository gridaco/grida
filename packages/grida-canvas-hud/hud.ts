import type cmath from "@grida/cmath";

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

// ---------------------------------------------------------------------------
// Draw primitives — the atoms every HUD feature composes from.
//
// All coordinates are in **document space** unless noted otherwise.
// The HUD canvas applies the viewport transform so callers never convert.
// ---------------------------------------------------------------------------

/**
 * A line segment in document space, extending `cmath.ui.Line` with
 * an optional `dashed` style.
 */
export interface HUDLine extends cmath.ui.Line {
  dashed?: boolean;
}

/**
 * A full-viewport axis-aligned line (infinite extent) at a given offset.
 *
 * `axis` indicates which axis the `offset` lives on:
 * - `"x"` → vertical line at x=offset
 * - `"y"` → horizontal line at y=offset
 *
 * Offset is in document space; the renderer projects it to screen.
 */
export interface HUDRule {
  axis: "x" | "y";
  offset: number;
}

/**
 * A complete set of draw commands for one frame.
 *
 * The HUD clears the canvas and draws everything in this struct each frame.
 * Callers build a `HUDDraw` from their domain data (snap result, measurement,
 * guide state, etc.) and hand it to `HUDCanvas.draw()`.
 */
export interface HUDDraw {
  lines?: HUDLine[];
  rules?: HUDRule[];
  points?: cmath.Vector2[];
}

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
    this.dpr = window.devicePixelRatio || 1;
    this.color = options?.color ?? DEFAULT_COLOR;
  }

  setColor(color: string) {
    this.color = color;
  }

  setSize(w: number, h: number) {
    if (this.width === w && this.height === h) return;
    this.dpr = window.devicePixelRatio || 1;
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

    const { lines, rules, points } = commands;

    if (rules && rules.length > 0) this.drawRules(rules);
    if (lines && lines.length > 0) this.drawLines(lines);
    if (points && points.length > 0) this.drawPoints(points);
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
    for (const line of lines) {
      if (line.dashed && !dashed) {
        ctx.setLineDash([4 / zoom, 3 / zoom]);
        dashed = true;
      } else if (!line.dashed && dashed) {
        ctx.setLineDash([]);
        dashed = false;
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
      ctx.fillStyle = this.color;
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
}
