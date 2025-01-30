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
   * @default "rgba(80, 200, 255, 0.5)"
   */
  readonly rangeBackgroundColor?: string;
}

export class RulerCanvas implements RulerOptions {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
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
      rangeBackgroundColor = "rgba(128, 128, 255, 0.25)",
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
  }

  setSize(w: number, h: number) {
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

  draw() {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // highlight ranges
    ctx.save();
    ctx.fillStyle = this.rangeBackgroundColor;
    console.log(this.ranges);
    for (const [start, end] of this.ranges) {
      const startCanvas = start * this.scale + this.translate;
      const endCanvas = end * this.scale + this.translate;
      if (this.axis === "x") {
        const x1 = Math.min(startCanvas, endCanvas);
        const x2 = Math.max(startCanvas, endCanvas);
        ctx.fillRect(x1, 0, x2 - x1, h);
      } else {
        const y1 = Math.min(startCanvas, endCanvas);
        const y2 = Math.max(startCanvas, endCanvas);
        ctx.fillRect(0, y1, w, y2 - y1);
      }
    }
    ctx.restore();

    ctx.font = this.font;
    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1;

    const step = this.getStepSize();
    const dimension = this.axis === "x" ? w : h;
    const startUnit = -this.translate / this.scale;
    const endUnit = startUnit + dimension / this.scale;
    const firstTick = Math.floor(startUnit / step) * step;

    for (let t = firstTick; t < endUnit; t += step) {
      const pos = t * this.scale + this.translate;
      if (pos < 0 || pos > dimension) continue;
      const dist = Math.abs(pos);
      ctx.globalAlpha =
        dist < this.fadeThreshold ? dist / this.fadeThreshold : 1;

      ctx.textAlign = "center";
      if (this.axis === "x") {
        ctx.beginPath();
        ctx.moveTo(pos, h - this.labelOffset - this.tickHeight);
        ctx.lineTo(pos, h);
        ctx.stroke();
        ctx.fillText(
          String(t),
          pos,
          h - this.labelOffset - (this.tickHeight + 4)
        );
      } else {
        ctx.beginPath();
        ctx.moveTo(w, pos);
        ctx.lineTo(w - (this.labelOffset + this.tickHeight), pos);
        ctx.stroke();
        ctx.save();
        ctx.translate(w - (this.labelOffset + this.tickHeight + 4), pos);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(String(t), 0, 0);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
}
