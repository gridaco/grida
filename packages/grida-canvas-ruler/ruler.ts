export type Axis = "x" | "y";
export type Range = [a: number, b: number];

export type Tick = {
  pos: number;
  color: string;
  font?: string;
  text?: string;
  textColor?: string;
  textAlign?: CanvasTextAlign;
  textAlignOffset?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeHeight?: number;
};

export interface RulerOptions {
  readonly axis: Axis;
  readonly zoom: number;
  readonly offset: number;

  /**
   * priority 0
   */
  readonly steps?: number[];

  /**
   * priority 1
   */
  readonly ranges?: Range[];

  /**
   * priority 2
   */
  readonly marks?: Tick[];

  /**
   * overlap fade threshold
   *
   * @default 24
   */
  readonly overlapThreshold?: number;
  readonly textSideOffset?: number;
  readonly tickHeight?: number;

  /**
   * @default "10px sans-serif"
   */
  readonly font?: string;

  /**
   * @default "transparent"
   */
  readonly backgroundColor?: string;

  /**
   * @default "rgba(128, 128, 128, 0.5)"
   */
  readonly color?: string;

  /**
   * @default "rgba(80, 200, 255, 0.25)"
   */
  readonly accentBackgroundColor?: string;

  /**
   * @default "rgba(80, 200, 255, 1)"
   */
  readonly accentColor?: string;
}

export class RulerCanvas implements RulerOptions {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  width: number = 0;
  height: number = 0;
  axis: Axis;
  steps: number[];
  overlapThreshold: number;
  zoom: number;
  offset: number;
  textSideOffset: number;
  font: string;
  ranges: Range[];
  marks: Tick[];
  backgroundColor: string;
  color: string;
  tickHeight: number;
  accentBackgroundColor: string;
  accentColor: string;

  /**
   * the points that takes priority over default rendering.
   *
   * if the tick overlaps with this point, it will be set with alpha for better visibility.
   */
  readonly priorityPoints: number[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    {
      axis,
      steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      ranges = [],
      marks = [],
      overlapThreshold = 24,
      offset = 0,
      zoom = 1,
      textSideOffset = 2,
      tickHeight = 4,
      font = "10px sans-serif",
      backgroundColor = "transparent",
      color = "rgba(128, 128, 128, 0.5)",
      accentBackgroundColor = "rgba(80, 200, 255, 0.25)",
      accentColor = "rgba(80, 200, 255, 1)",
    }: RulerOptions
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.dpr = window.devicePixelRatio || 1;
    this.axis = axis;
    this.steps = steps;
    this.ranges = ranges;
    this.marks = marks;
    this.overlapThreshold = overlapThreshold;
    this.zoom = zoom;
    this.offset = offset;
    this.textSideOffset = textSideOffset;
    this.font = font;
    this.backgroundColor = backgroundColor;
    this.color = color;
    this.tickHeight = tickHeight;
    this.accentBackgroundColor = accentBackgroundColor;
    this.accentColor = accentColor;
  }

  setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private getStepSize() {
    const minPxPerTick = 50;
    for (const s of this.steps) {
      if (s * this.zoom >= minPxPerTick) return s;
    }
    return this.steps[this.steps.length - 1];
  }

  private renderTick(tick: Tick) {
    const {
      pos,
      color,
      font = this.font,
      text,
      textColor = color,
      textAlign = "center",
      textAlignOffset = 0,
    } = tick;
    // skip if too close to priority points
    const skipThreshold = 10;
    for (const p of this.priorityPoints) {
      const pCanvas = p * this.zoom + this.offset;
      if (Math.abs(pCanvas - pos) < skipThreshold) return;
    }

    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = textAlign;
    this.ctx.font = font;

    if (this.axis === "x") {
      this.ctx.beginPath();
      this.ctx.moveTo(pos, this.height - this.textSideOffset - this.tickHeight);
      this.ctx.lineTo(pos, this.height);
      this.ctx.stroke();
      if (text) {
        this.ctx.fillText(
          text,
          pos + textAlignOffset,
          this.height - this.textSideOffset - (this.tickHeight + 4)
        );
      }
    } else {
      this.ctx.beginPath();
      this.ctx.moveTo(this.width, pos);
      this.ctx.lineTo(
        this.width - (this.textSideOffset + this.tickHeight),
        pos
      );
      this.ctx.stroke();
      if (text) {
        this.ctx.translate(
          this.width - (this.textSideOffset + this.tickHeight + 4),
          pos + textAlignOffset
        );
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.fillText(text, 0, 0);
      }
    }

    this.ctx.restore();
  }

  private renderRange(
    [start, end]: Range,
    color: string = this.accentBackgroundColor
  ) {
    const ctx = this.ctx;
    const startCanvas = start * this.zoom + this.offset;
    const endCanvas = end * this.zoom + this.offset;

    ctx.save();
    ctx.fillStyle = color;

    const a = Math.min(startCanvas, endCanvas);
    const b = Math.max(startCanvas, endCanvas);
    if (this.axis === "x") {
      ctx.fillRect(a, 0, b - a, this.height);
      this.renderTick({
        pos: a,
        text: String(start),
        color: this.accentColor,
        textAlign: "end",
        textAlignOffset: -4,
      });
      this.renderTick({
        pos: b,
        text: String(end),
        color: this.accentColor,
        textAlign: "start",
        textAlignOffset: 4,
      });
    } else {
      ctx.fillRect(0, a, this.width, b - a);
      this.renderTick({
        pos: a,
        text: String(start),
        color: this.accentColor,
        textAlign: "start",
        textAlignOffset: -4,
      });
      this.renderTick({
        pos: b,
        text: String(end),
        color: this.accentColor,
        textAlign: "end",
        textAlignOffset: 4,
      });
    }
    ctx.restore();
  }

  update(opts: Partial<RulerOptions>) {
    // update only the defined properties
    for (const key in opts) {
      if (opts[key as keyof RulerOptions] !== undefined) {
        (this as any)[key] = opts[key as keyof RulerOptions];
      }
    }
  }

  private tickToCanvasSpace(tick: Tick): Tick {
    return {
      ...tick,
      pos: tick.pos * this.zoom + this.offset,
    };
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // [background]
    ctx.save();
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();

    // [ranges]
    // merge & render ranges
    const mergedRanges = mergeOverlappingRanges(this.ranges);
    // clear existing priority points each time
    this.priorityPoints.length = 0;
    for (const r of mergedRanges) {
      this.renderRange(r);
      this.priorityPoints.push(r[0], r[1]);
    }

    // [marks]
    for (const m of this.marks) {
      const c = this.tickToCanvasSpace(m);
      this.renderTick(c);
      this.priorityPoints.push(m.pos);
    }

    // [ticks]
    const step = this.getStepSize();
    const dimension = this.axis === "x" ? this.width : this.height;
    const startUnit = -this.offset / this.zoom;
    const endUnit = startUnit + dimension / this.zoom;
    const firstTick = Math.floor(startUnit / step) * step;

    for (let t = firstTick; t < endUnit; t += step) {
      const pos = t * this.zoom + this.offset;
      if (pos < 0 || pos > dimension) continue;
      ctx.globalAlpha =
        Math.abs(pos) < this.overlapThreshold
          ? Math.abs(pos) / this.overlapThreshold
          : 1;
      this.renderTick({
        pos: pos,
        text: String(t),
        color: this.color,
      });
    }
    ctx.globalAlpha = 1;
  }
}

function mergeOverlappingRanges(ranges: Range[]): Range[] {
  if (!ranges.length) return [];
  // sort by start
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Range[] = [];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    // overlap check
    if (curr[0] <= prev[1]) {
      prev = [prev[0], Math.max(prev[1], curr[1])];
    } else {
      merged.push(prev);
      prev = curr;
    }
  }
  merged.push(prev);
  return merged;
}
