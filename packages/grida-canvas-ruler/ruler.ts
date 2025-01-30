export type Axis = "x" | "y";
export type Range = [a: number, b: number];

export interface RulerOptions {
  readonly axis: Axis;
  readonly steps?: number[];
  readonly ranges?: Range[];
  readonly fadeThreshold?: number;
  readonly scale: number;
  readonly translate: number;
  readonly labelOffset?: number;
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
  readonly rangeBackgroundColor?: string;

  /**
   * @default "rgba(80, 200, 255, 1)"
   */
  readonly rangeTickColor?: string;
}

export class RulerCanvas implements RulerOptions {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  width: number = 0;
  height: number = 0;
  readonly axis: Axis;
  readonly steps: number[];
  readonly fadeThreshold: number;
  readonly scale: number;
  readonly translate: number;
  readonly labelOffset: number;
  readonly font: string;
  readonly ranges: Range[];
  readonly backgroundColor: string;
  readonly color: string;
  readonly tickHeight: number;
  readonly rangeBackgroundColor: string;
  readonly rangeTickColor: string;

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
      fadeThreshold = 30,
      translate = 0,
      scale = 1,
      labelOffset = 2,
      tickHeight = 4,
      font = "10px sans-serif",
      backgroundColor = "transparent",
      color = "rgba(128, 128, 128, 0.5)",
      rangeBackgroundColor = "rgba(80, 200, 255, 0.25)",
      rangeTickColor = "rgba(80, 200, 255, 1)",
    }: RulerOptions
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.dpr = window.devicePixelRatio || 1;
    this.axis = axis;
    this.steps = steps;
    this.ranges = ranges;
    this.fadeThreshold = fadeThreshold;
    this.scale = scale;
    this.translate = translate;
    this.labelOffset = labelOffset;
    this.font = font;
    this.backgroundColor = backgroundColor;
    this.color = color;
    this.tickHeight = tickHeight;
    this.rangeBackgroundColor = rangeBackgroundColor;
    this.rangeTickColor = rangeTickColor;
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
      if (s * this.scale >= minPxPerTick) return s;
    }
    return this.steps[this.steps.length - 1];
  }

  private renderTick(
    pos: number,
    label: string,
    color: string = this.color,
    textAlign: CanvasTextAlign = "center",
    textAlignOffset: number = 0
  ) {
    // skip if too close to priority points
    const skipThreshold = 10;
    for (const p of this.priorityPoints) {
      const pCanvas = p * this.scale + this.translate;
      if (Math.abs(pCanvas - pos) < skipThreshold) return;
    }

    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = textAlign;

    if (this.axis === "x") {
      this.ctx.beginPath();
      this.ctx.moveTo(pos, this.height - this.labelOffset - this.tickHeight);
      this.ctx.lineTo(pos, this.height);
      this.ctx.stroke();
      this.ctx.fillText(
        label,
        pos + textAlignOffset,
        this.height - this.labelOffset - (this.tickHeight + 4)
      );
    } else {
      this.ctx.beginPath();
      this.ctx.moveTo(this.width, pos);
      this.ctx.lineTo(this.width - (this.labelOffset + this.tickHeight), pos);
      this.ctx.stroke();
      this.ctx.translate(
        this.width - (this.labelOffset + this.tickHeight + 4),
        pos + textAlignOffset
      );
      this.ctx.rotate(-Math.PI / 2);
      this.ctx.fillText(label, 0, 0);
    }

    this.ctx.restore();
  }

  private renderRange(
    [start, end]: Range,
    color: string = this.rangeBackgroundColor
  ) {
    const ctx = this.ctx;
    const startCanvas = start * this.scale + this.translate;
    const endCanvas = end * this.scale + this.translate;

    ctx.save();
    ctx.fillStyle = color;

    if (this.axis === "x") {
      const x1 = Math.min(startCanvas, endCanvas);
      const x2 = Math.max(startCanvas, endCanvas);
      ctx.fillRect(x1, 0, x2 - x1, this.height);
      this.renderTick(x1, String(start), this.rangeTickColor, "end", -4);
      this.renderTick(x2, String(end), this.rangeTickColor, "start", 4);
    } else {
      const y1 = Math.min(startCanvas, endCanvas);
      const y2 = Math.max(startCanvas, endCanvas);
      ctx.fillRect(0, y1, this.width, y2 - y1);
      this.renderTick(y1, String(start), this.rangeTickColor, "start", -4);
      this.renderTick(y2, String(end), this.rangeTickColor, "end", 4);
    }
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // background
    ctx.save();
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();

    // merge & render ranges
    const mergedRanges = mergeOverlappingRanges(this.ranges);
    // clear existing priority points each time
    this.priorityPoints.length = 0;
    for (const r of mergedRanges) {
      this.renderRange(r);
      this.priorityPoints.push(r[0], r[1]);
    }

    ctx.font = this.font;
    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1;

    const step = this.getStepSize();
    const dimension = this.axis === "x" ? this.width : this.height;
    const startUnit = -this.translate / this.scale;
    const endUnit = startUnit + dimension / this.scale;
    const firstTick = Math.floor(startUnit / step) * step;

    for (let t = firstTick; t < endUnit; t += step) {
      const pos = t * this.scale + this.translate;
      if (pos < 0 || pos > dimension) continue;
      ctx.globalAlpha =
        Math.abs(pos) < this.fadeThreshold
          ? Math.abs(pos) / this.fadeThreshold
          : 1;
      this.renderTick(pos, String(t));
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
